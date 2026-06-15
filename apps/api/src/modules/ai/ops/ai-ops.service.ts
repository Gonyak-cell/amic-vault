import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { LocalGemmaGateway, localGemmaDefaultModel } from '@amic-vault/ai';
import {
  localAiOpsHealthSchema,
  localAiOpsMetricsSchema,
  type LocalAiEndpointClass,
  type LocalAiOpsHealthDto,
  type LocalAiOpsMetricsDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { AuditService } from '../../audit/audit.service';

interface ActorRoleRow {
  role: string;
  status: string;
}

interface OpsAggregateRow {
  queue_backlog_count: number;
  blocked_prep_count: number;
  p95_latency_ms: number | null;
}

interface OpsMetricsRow {
  prep_completed_count: number;
  prep_blocked_count: number;
  prep_failed_count: number;
  prep_stale_count: number;
  prep_fallback_count: number;
  stale_rebuild_count: number;
  generation_completed_count: number;
  generation_blocked_count: number;
  invalid_output_count: number;
  citation_rejected_count: number;
  p95_prep_latency_ms: number | null;
  p95_generation_latency_ms: number | null;
}

@Injectable()
export class AiOpsService {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async getHealth(ctx: PermissionContext): Promise<LocalAiOpsHealthDto> {
    const gatewayHealth = await this.safeGatewayHealth();
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.assertAdmin(client, ctx);
      const aggregate = await this.collectHealthAggregate(client, ctx.tenantId);
      const degradedMode =
        gatewayHealth.status !== 'ready' || Number(aggregate.blocked_prep_count) > 0;
      const status =
        gatewayHealth.status === 'ready'
          ? degradedMode
            ? 'degraded'
            : 'ready'
          : 'blocked';
      const health = localAiOpsHealthSchema.parse({
        status,
        modelRoute: 'local_gemma',
        modelName: gatewayHealth.model?.name ?? null,
        parameterSize: gatewayHealth.model?.parameterSize ?? null,
        endpointClass: endpointClass(localGemmaEndpoint()),
        queueBacklogCount: Number(aggregate.queue_backlog_count),
        p95LatencyMs:
          aggregate.p95_latency_ms === null ? null : Math.round(Number(aggregate.p95_latency_ms)),
        blockedPrepCount: Number(aggregate.blocked_prep_count),
        degradedMode,
        reasonCode: gatewayHealth.reasonCode ?? null,
      });
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SCALE_READINESS_VIEWED',
          targetType: 'local_ai_ops',
          targetId: null,
          metadata: {
            model_route: 'local_gemma',
            readiness_status: health.status,
            blocked_reason: health.reasonCode,
            p95_ms: health.p95LatencyMs,
            result_count: health.queueBacklogCount,
          },
        },
        client,
      );
      return health;
    });
  }

  async getMetrics(ctx: PermissionContext): Promise<LocalAiOpsMetricsDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.assertAdmin(client, ctx);
      const row = await this.collectMetrics(client, ctx.tenantId);
      const metrics = localAiOpsMetricsSchema.parse({
        prepCompletedCount: Number(row.prep_completed_count),
        prepBlockedCount: Number(row.prep_blocked_count),
        prepFailedCount: Number(row.prep_failed_count),
        prepStaleCount: Number(row.prep_stale_count),
        prepFallbackCount: Number(row.prep_fallback_count),
        staleRebuildCount: Number(row.stale_rebuild_count),
        generationCompletedCount: Number(row.generation_completed_count),
        generationBlockedCount: Number(row.generation_blocked_count),
        invalidOutputCount: Number(row.invalid_output_count),
        citationRejectedCount: Number(row.citation_rejected_count),
        p95PrepLatencyMs:
          row.p95_prep_latency_ms === null ? null : Math.round(Number(row.p95_prep_latency_ms)),
        p95GenerationLatencyMs:
          row.p95_generation_latency_ms === null
            ? null
            : Math.round(Number(row.p95_generation_latency_ms)),
      });
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SCALE_READINESS_VIEWED',
          targetType: 'local_ai_metrics',
          targetId: null,
          metadata: {
            model_route: 'local_gemma',
            result_count: metrics.prepCompletedCount + metrics.generationCompletedCount,
            blocked_reason: metrics.invalidOutputCount > 0 ? 'invalid_output' : null,
            p95_ms: metrics.p95PrepLatencyMs,
          },
        },
        client,
      );
      return metrics;
    });
  }

  private async safeGatewayHealth() {
    try {
      const gateway = new LocalGemmaGateway({
        route: 'local_gemma',
        enabled: localGemmaEnabled(),
        endpoint: localGemmaEndpoint(),
        model: localGemmaModel(),
        timeoutMs: 3000,
      });
      return await gateway.health();
    } catch {
      return {
        status: 'blocked' as const,
        route: 'local_gemma' as const,
        reasonCode: 'local_endpoint_unhealthy' as const,
      };
    }
  }

  private async assertAdmin(client: PoolClient, ctx: PermissionContext): Promise<void> {
    const result = await client.query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const actor = result.rows[0];
    if (
      actor?.status !== 'active' ||
      (actor.role !== 'firm_admin' && actor.role !== 'security_admin')
    ) {
      throw permissionDenied();
    }
  }

  private async collectHealthAggregate(
    client: PoolClient,
    tenantId: string,
  ): Promise<OpsAggregateRow> {
    const result = await client.query<OpsAggregateRow>(
      `
        SELECT
          count(*) FILTER (WHERE status = 'pending' AND is_stale = false)::int
            AS queue_backlog_count,
          count(*) FILTER (WHERE status IN ('blocked', 'failed'))::int
            AS blocked_prep_count,
          percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (
            WHERE latency_ms IS NOT NULL
          )::int AS p95_latency_ms
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
      `,
      [tenantId],
    );
    return (
      result.rows[0] ?? { queue_backlog_count: 0, blocked_prep_count: 0, p95_latency_ms: null }
    );
  }

  private async collectMetrics(client: PoolClient, tenantId: string): Promise<OpsMetricsRow> {
    const result = await client.query<OpsMetricsRow>(
      `
        WITH fallback_audits AS (
          SELECT DISTINCT target_id AS ai_prep_artifact_id
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'AI_PREP_COMPLETED'
            AND target_type = 'ai_prep_artifact'
            AND target_id IS NOT NULL
            AND metadata_json->>'generation_result' = 'fallback'
            AND metadata_json ? 'fallback_reason_code'
        ),
        prep AS (
          SELECT
            count(*) FILTER (WHERE status = 'completed')::int AS prep_completed_count,
            count(*) FILTER (WHERE status = 'blocked')::int AS prep_blocked_count,
            count(*) FILTER (WHERE status = 'failed')::int AS prep_failed_count,
            count(*) FILTER (WHERE status = 'stale' OR is_stale = true)::int AS prep_stale_count,
            count(*) FILTER (
              WHERE status = 'completed'
                AND (
                  ai_prep_artifact_id IN (SELECT ai_prep_artifact_id FROM fallback_audits)
                  OR (
                    jsonb_typeof(payload_json->'warnings') = 'array'
                    AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements_text(payload_json->'warnings') AS warning(value)
                      WHERE warning.value LIKE 'LOCAL_GEMMA_%_FALLBACK'
                    )
                  )
                )
            )::int AS prep_fallback_count,
            count(*) FILTER (WHERE is_stale = true)::int AS stale_rebuild_count,
            count(*) FILTER (
              WHERE failure_reason_code IN ('UNSUPPORTED_CLAIM', 'SCHEMA_INVALID', 'INVALID_OUTPUT')
            )::int AS invalid_output_count,
            percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (
              WHERE latency_ms IS NOT NULL
            )::int AS p95_prep_latency_ms
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
        ),
        generation AS (
          SELECT
            count(*) FILTER (WHERE status = 'responded')::int AS generation_completed_count,
            count(*) FILTER (WHERE status IN ('blocked', 'failed'))::int
              AS generation_blocked_count,
            percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (
              WHERE latency_ms IS NOT NULL
            )::int AS p95_generation_latency_ms
          FROM ai_sessions
          WHERE tenant_id = $1
        ),
        citations AS (
          SELECT count(*)::int AS citation_rejected_count
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'AI_RETRIEVAL_EXCLUDED'
        )
        SELECT *
        FROM prep, generation, citations
      `,
      [tenantId],
    );
    return (
      result.rows[0] ?? {
        prep_completed_count: 0,
        prep_blocked_count: 0,
        prep_failed_count: 0,
        prep_stale_count: 0,
        prep_fallback_count: 0,
        stale_rebuild_count: 0,
        generation_completed_count: 0,
        generation_blocked_count: 0,
        invalid_output_count: 0,
        citation_rejected_count: 0,
        p95_prep_latency_ms: null,
        p95_generation_latency_ms: null,
      }
    );
  }
}

function localGemmaEndpoint(): string {
  return process.env.LOCAL_GEMMA_ENDPOINT ?? process.env.AI_GATEWAY_ENDPOINT ?? 'http://127.0.0.1:11434';
}

function localGemmaModel(): string {
  return process.env.LOCAL_GEMMA_MODEL ?? localGemmaDefaultModel;
}

function localGemmaEnabled(): boolean {
  const raw = process.env.LOCAL_GEMMA_ENABLED ?? process.env.AI_PREP_ENABLED ?? 'true';
  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

function endpointClass(endpoint: string): LocalAiEndpointClass {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'loopback';
    if (
      host === 'gemma' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.svc') ||
      isPrivateIpv4(host)
    ) {
      return 'private_network';
    }
    return 'blocked';
  } catch {
    return 'blocked';
  }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function permissionDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}
