import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { GraphSyncService, type GraphSyncContext } from './graph-sync.service';

export const graphSyncOutboxReasonCodes = [
  'document_uploaded',
  'document_version_added',
  'document_deleted',
  'document_restored',
  'document_status_changed',
  'document_text_extracted',
  'litigation_fact_changed',
  'litigation_issue_changed',
  'dd_issue_changed',
  'dd_risk_changed',
] as const;

export type GraphSyncOutboxReasonCode = (typeof graphSyncOutboxReasonCodes)[number];

export interface EnqueueGraphSyncInput {
  tenantId: string;
  matterId: string;
  reasonCode: GraphSyncOutboxReasonCode;
  requestedBy?: string | null;
}

interface GraphSyncOutboxRow {
  graph_sync_outbox_id: string;
  tenant_id: string;
  matter_id: string;
  reason_codes: GraphSyncOutboxReasonCode[];
  requested_by: string | null;
  attempt_count: number;
}

interface ClaimedMatter {
  matterId: string;
  requestedBy: string | null;
  outboxIds: string[];
  reasonCodes: GraphSyncOutboxReasonCode[];
  attemptCount: number;
}

export interface RunGraphSyncOutboxOptions {
  limit?: number;
  maxAttempts?: number;
  retryDelaySeconds?: number;
  sessionId?: string | null;
}

export interface RunGraphSyncOutboxResult {
  selectedCount: number;
  matterCount: number;
  syncedCount: number;
  retryCount: number;
  deadLetterCount: number;
}

function graphSyncOutboxWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.GRAPH_SYNC_OUTBOX_WORKER_ENABLED ?? '');
}

function graphSyncOutboxTenantIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.GRAPH_SYNC_OUTBOX_TENANT_IDS ?? '')
    .split(',')
    .map((tenantId) => tenantId.trim())
    .filter((tenantId) => tenantId.length > 0);
}

function graphSyncOutboxPollingMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.GRAPH_SYNC_OUTBOX_POLLING_MS ?? '5000');
  return Number.isFinite(parsed) && parsed >= 1000 ? Math.round(parsed) : 5000;
}

@Injectable()
export class GraphSyncOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphSyncOutboxWorker.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(GraphSyncService) private readonly graphSyncService: GraphSyncService,
  ) {}

  onModuleInit(): void {
    if (!graphSyncOutboxWorkerEnabled()) return;
    const tenantIds = graphSyncOutboxTenantIds();
    if (tenantIds.length === 0) {
      this.logger.warn({ code: 'GRAPH_SYNC_OUTBOX_TENANTS_MISSING' });
      return;
    }
    this.timer = setInterval(() => {
      void this.runConfiguredTenants(tenantIds);
    }, graphSyncOutboxPollingMs());
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(input: EnqueueGraphSyncInput, client: PoolClient): Promise<string> {
    const updated = await client.query<{ graph_sync_outbox_id: string }>(
      `
        UPDATE graph_sync_outbox
        SET reason_codes = (
            SELECT array_agg(DISTINCT reason_code ORDER BY reason_code)
            FROM unnest(graph_sync_outbox.reason_codes || ARRAY[$3]::text[]) AS reason_code
          ),
          requested_by = COALESCE(graph_sync_outbox.requested_by, $4),
          next_attempt_at = LEAST(graph_sync_outbox.next_attempt_at, now()),
          updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status = 'pending'
        RETURNING graph_sync_outbox_id
      `,
      [input.tenantId, input.matterId, input.reasonCode, input.requestedBy ?? null],
    );
    const existing = updated.rows[0]?.graph_sync_outbox_id;
    if (existing) return existing;

    const inserted = await client.query<{ graph_sync_outbox_id: string }>(
      `
        INSERT INTO graph_sync_outbox (
          tenant_id, matter_id, reason_codes, requested_by
        )
        VALUES ($1, $2, ARRAY[$3]::text[], $4)
        RETURNING graph_sync_outbox_id
      `,
      [input.tenantId, input.matterId, input.reasonCode, input.requestedBy ?? null],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('graph sync outbox insert returned no row');
    return row.graph_sync_outbox_id;
  }

  async runOnceForTenant(
    tenantId: string,
    options: RunGraphSyncOutboxOptions = {},
  ): Promise<RunGraphSyncOutboxResult> {
    const maxAttempts = options.maxAttempts ?? 3;
    const retryDelaySeconds = options.retryDelaySeconds ?? 5;
    const claimed = await this.claimPending(tenantId, options.limit ?? 25);
    const result: RunGraphSyncOutboxResult = {
      selectedCount: claimed.reduce((count, matter) => count + matter.outboxIds.length, 0),
      matterCount: claimed.length,
      syncedCount: 0,
      retryCount: 0,
      deadLetterCount: 0,
    };

    for (const matter of claimed) {
      const ctx: GraphSyncContext = {
        tenantId,
        userId: matter.requestedBy,
        sessionId: options.sessionId ?? null,
      };
      try {
        await this.graphSyncService.syncMatter(ctx, matter.matterId);
        await this.markCompleted(tenantId, matter.outboxIds);
        result.syncedCount += 1;
      } catch {
        if (matter.attemptCount >= maxAttempts) {
          await this.markDeadLetter(tenantId, matter);
          result.deadLetterCount += 1;
        } else {
          await this.markRetry(tenantId, matter.outboxIds, retryDelaySeconds);
          result.retryCount += 1;
        }
      }
    }
    return result;
  }

  private async runConfiguredTenants(tenantIds: string[]): Promise<void> {
    for (const tenantId of tenantIds) {
      try {
        await this.runOnceForTenant(tenantId);
      } catch {
        this.logger.warn({ code: 'GRAPH_SYNC_OUTBOX_TICK_FAILED', tenantId });
      }
    }
  }

  private async claimPending(tenantId: string, limit: number): Promise<ClaimedMatter[]> {
    return this.auditService.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE graph_sync_outbox
          SET status = 'pending',
            locked_at = NULL,
            updated_at = now()
          WHERE tenant_id = $1
            AND status = 'processing'
            AND locked_at < now() - interval '5 minutes'
        `,
        [tenantId],
      );
      const selected = await client.query<GraphSyncOutboxRow>(
        `
          SELECT graph_sync_outbox_id, tenant_id, matter_id, reason_codes,
            requested_by, attempt_count
          FROM graph_sync_outbox
          WHERE tenant_id = $1
            AND status = 'pending'
            AND next_attempt_at <= now()
          ORDER BY updated_at ASC, created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `,
        [tenantId, limit],
      );
      if (selected.rows.length === 0) return [];

      const ids = selected.rows.map((row) => row.graph_sync_outbox_id);
      await client.query(
        `
          UPDATE graph_sync_outbox
          SET status = 'processing',
            attempt_count = attempt_count + 1,
            locked_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND graph_sync_outbox_id = ANY($2::uuid[])
        `,
        [tenantId, ids],
      );
      return coalesceClaimedRows(selected.rows);
    });
  }

  private async markCompleted(tenantId: string, outboxIds: string[]): Promise<void> {
    await this.auditService.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE graph_sync_outbox
          SET status = 'completed',
            completed_at = now(),
            locked_at = NULL,
            updated_at = now()
          WHERE tenant_id = $1
            AND graph_sync_outbox_id = ANY($2::uuid[])
        `,
        [tenantId, outboxIds],
      );
    });
  }

  private async markRetry(
    tenantId: string,
    outboxIds: string[],
    retryDelaySeconds: number,
  ): Promise<void> {
    await this.auditService.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE graph_sync_outbox
          SET status = 'pending',
            locked_at = NULL,
            next_attempt_at = now() + ($3::integer * interval '1 second'),
            last_error_code = 'GRAPH_SYNC_FAILED',
            updated_at = now()
          WHERE tenant_id = $1
            AND graph_sync_outbox_id = ANY($2::uuid[])
        `,
        [tenantId, outboxIds, retryDelaySeconds],
      );
    });
  }

  private async markDeadLetter(tenantId: string, matter: ClaimedMatter): Promise<void> {
    await this.auditService.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE graph_sync_outbox
          SET status = 'dead_letter',
            locked_at = NULL,
            dead_lettered_at = now(),
            last_error_code = 'GRAPH_SYNC_RETRY_EXHAUSTED',
            updated_at = now()
          WHERE tenant_id = $1
            AND graph_sync_outbox_id = ANY($2::uuid[])
        `,
        [tenantId, matter.outboxIds],
      );
      await this.auditService.log(
        {
          tenantId,
          actorType: 'system',
          actorId: null,
          action: 'GRAPH_SYNC_FAILED',
          targetType: 'graph_sync_outbox',
          targetId: matter.outboxIds[0] ?? null,
          matterId: matter.matterId,
          result: 'failure',
          metadata: {
            matter_id: matter.matterId,
            request_id: matter.outboxIds[0] ?? null,
            reason_code: 'retry_exhausted',
            error_types: ['GRAPH_SYNC_FAILED'],
          },
        },
        client,
      );
    });
  }
}

function coalesceClaimedRows(rows: GraphSyncOutboxRow[]): ClaimedMatter[] {
  const byMatter = new Map<string, ClaimedMatter>();
  for (const row of rows) {
    const existing = byMatter.get(row.matter_id);
    if (existing) {
      existing.outboxIds.push(row.graph_sync_outbox_id);
      existing.reasonCodes = Array.from(new Set([...existing.reasonCodes, ...row.reason_codes]));
      existing.attemptCount = Math.max(existing.attemptCount, row.attempt_count + 1);
      existing.requestedBy ??= row.requested_by;
      continue;
    }
    byMatter.set(row.matter_id, {
      matterId: row.matter_id,
      requestedBy: row.requested_by,
      outboxIds: [row.graph_sync_outbox_id],
      reasonCodes: [...row.reason_codes],
      attemptCount: row.attempt_count + 1,
    });
  }
  return [...byMatter.values()];
}
