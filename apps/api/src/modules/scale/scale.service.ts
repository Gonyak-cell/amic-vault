import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  scaleAiGateReviewListResponseSchema,
  scaleAiGateReviewSchema,
  scaleCostSnapshotListResponseSchema,
  scaleCostSnapshotSchema,
  scaleEvalRunListResponseSchema,
  scaleEvalRunSchema,
  scaleLearningEventListResponseSchema,
  scaleLearningEventSchema,
  scaleMigrationDrillListResponseSchema,
  scaleMigrationDrillSchema,
  scalePerformanceRunListResponseSchema,
  scalePerformanceRunSchema,
  scaleReadinessSummarySchema,
  type CreateScaleAiGateReviewRequestDto,
  type CreateScaleCostSnapshotRequestDto,
  type CreateScaleEvalRunRequestDto,
  type CreateScaleLearningEventRequestDto,
  type CreateScaleMigrationDrillRequestDto,
  type CreateScalePerformanceRunRequestDto,
  type PermissionContext,
  type ScaleAiGateReviewDto,
  type ScaleAiGateReviewListResponseDto,
  type ScaleCostSnapshotDto,
  type ScaleCostSnapshotListResponseDto,
  type ScaleEvalRunDto,
  type ScaleEvalRunListResponseDto,
  type ScaleLearningEventDto,
  type ScaleLearningEventListResponseDto,
  type ScaleMigrationDrillDto,
  type ScaleMigrationDrillListResponseDto,
  type ScalePerformanceRunDto,
  type ScalePerformanceRunListResponseDto,
  type ScaleReadinessSummaryDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface ActorRoleRow {
  role: string;
  status: string;
}

interface PerformanceRunRow {
  performance_run_id: string;
  scenario: 'api_readiness' | 'search_query' | 'ai_gate' | 'db_integration' | 'web_console';
  sample_count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  target_p95_ms: number;
  status: 'pass' | 'fail';
  measurement_hash: string;
  evidence_ref: string;
  created_at: Date;
}

interface CostSnapshotRow {
  cost_snapshot_id: string;
  scope: 'compute' | 'storage' | 'database' | 'ai' | 'total';
  period_start: string | Date;
  period_end: string | Date;
  unit_count: string;
  estimated_cost_cents: string;
  currency: 'KRW' | 'USD';
  cost_model_hash: string;
  evidence_ref: string;
  created_at: Date;
}

interface EvalRunRow {
  eval_run_id: string;
  suite: 'search_korean' | 'ai_gate' | 'contract_gate' | 'graph_consistency' | 'full_regression';
  case_count: number;
  pass_count: number;
  fail_count: number;
  status: 'pass' | 'fail';
  metric_hash: string;
  evidence_ref: string;
  created_at: Date;
}

interface MigrationDrillRow {
  migration_drill_id: string;
  scope: 'full_roundtrip' | 'latest_down_up' | 'schema_hash';
  duration_ms: number;
  schema_hash_before: string;
  schema_hash_after: string;
  status: 'pass' | 'fail';
  evidence_ref: string;
  created_at: Date;
}

interface LearningEventRow {
  learning_event_id: string;
  category: 'validation_failure' | 'optimization' | 'release_boundary' | 'drift' | 'gate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern_code: string;
  evidence_ref: string;
  resolution_ref: string;
  created_at: Date;
}

interface AiGateReviewRow {
  ai_gate_review_id: string;
  candidate_route: 'local_gemma' | 'external_model';
  decision: 'external_blocked' | 'deferred' | 'local_only';
  external_model_allowed: boolean;
  control_hash: string;
  evidence_ref: string;
  created_at: Date;
}

@Injectable()
export class ScaleService {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async createPerformanceRun(
    ctx: PermissionContext,
    input: CreateScalePerformanceRunRequestDto,
  ): Promise<ScalePerformanceRunDto> {
    await this.assertScaleAdmin(ctx);
    const status = input.p95Ms <= input.targetP95Ms ? 'pass' : 'fail';
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<PerformanceRunRow>(
        `
          INSERT INTO scale_performance_runs (
            tenant_id, scenario, sample_count, p50_ms, p95_ms, p99_ms,
            target_p95_ms, status, measurement_hash, evidence_ref, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING performance_run_id, scenario, sample_count, p50_ms, p95_ms,
            p99_ms, target_p95_ms, status, measurement_hash, evidence_ref, created_at
        `,
        [
          ctx.tenantId,
          input.scenario,
          input.sampleCount,
          input.p50Ms,
          input.p95Ms,
          input.p99Ms,
          input.targetP95Ms,
          status,
          input.measurementHash,
          input.evidenceRef,
          ctx.userId,
        ],
      );
      const run = mapPerformanceRun(result.rows[0]);
      await this.auditScale(client, ctx, 'SCALE_PERFORMANCE_RECORDED', 'scale_performance_run', run.performanceRunId, {
        performance_run_id: run.performanceRunId,
        scenario: run.scenario,
        p50_ms: run.p50Ms,
        p95_ms: run.p95Ms,
        p99_ms: run.p99Ms,
        target_p95_ms: run.targetP95Ms,
        measurement_hash: run.measurementHash,
        status_after: run.status,
      });
      return run;
    });
  }

  async listPerformanceRuns(ctx: PermissionContext): Promise<ScalePerformanceRunListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<PerformanceRunRow>(
      `
        SELECT performance_run_id, scenario, sample_count, p50_ms, p95_ms,
          p99_ms, target_p95_ms, status, measurement_hash, evidence_ref, created_at
        FROM scale_performance_runs
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scalePerformanceRunListResponseSchema.parse({ runs: result.rows.map(mapPerformanceRun) });
  }

  async createCostSnapshot(
    ctx: PermissionContext,
    input: CreateScaleCostSnapshotRequestDto,
  ): Promise<ScaleCostSnapshotDto> {
    await this.assertScaleAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<CostSnapshotRow>(
        `
          INSERT INTO scale_cost_snapshots (
            tenant_id, scope, period_start, period_end, unit_count,
            estimated_cost_cents, currency, cost_model_hash, evidence_ref, created_by
          )
          VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10)
          RETURNING cost_snapshot_id, scope, period_start, period_end, unit_count,
            estimated_cost_cents, currency, cost_model_hash, evidence_ref, created_at
        `,
        [
          ctx.tenantId,
          input.scope,
          input.periodStart,
          input.periodEnd,
          input.unitCount,
          input.estimatedCostCents,
          input.currency,
          input.costModelHash,
          input.evidenceRef,
          ctx.userId,
        ],
      );
      const snapshot = mapCostSnapshot(result.rows[0]);
      await this.auditScale(client, ctx, 'SCALE_COST_SNAPSHOT_RECORDED', 'scale_cost_snapshot', snapshot.costSnapshotId, {
        cost_snapshot_id: snapshot.costSnapshotId,
        cost_scope: snapshot.scope,
        unit_count: snapshot.unitCount,
        estimated_cost_cents: snapshot.estimatedCostCents,
        cost_model_hash: snapshot.costModelHash,
      });
      return snapshot;
    });
  }

  async listCostSnapshots(ctx: PermissionContext): Promise<ScaleCostSnapshotListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<CostSnapshotRow>(
      `
        SELECT cost_snapshot_id, scope, period_start, period_end, unit_count,
          estimated_cost_cents, currency, cost_model_hash, evidence_ref, created_at
        FROM scale_cost_snapshots
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scaleCostSnapshotListResponseSchema.parse({ snapshots: result.rows.map(mapCostSnapshot) });
  }

  async createEvalRun(
    ctx: PermissionContext,
    input: CreateScaleEvalRunRequestDto,
  ): Promise<ScaleEvalRunDto> {
    await this.assertScaleAdmin(ctx);
    const status = input.caseCount > 0 && input.failCount === 0 ? 'pass' : 'fail';
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<EvalRunRow>(
        `
          INSERT INTO scale_eval_runs (
            tenant_id, suite, case_count, pass_count, fail_count,
            status, metric_hash, evidence_ref, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING eval_run_id, suite, case_count, pass_count, fail_count,
            status, metric_hash, evidence_ref, created_at
        `,
        [
          ctx.tenantId,
          input.suite,
          input.caseCount,
          input.passCount,
          input.failCount,
          status,
          input.metricHash,
          input.evidenceRef,
          ctx.userId,
        ],
      );
      const run = mapEvalRun(result.rows[0]);
      await this.auditScale(client, ctx, 'SCALE_EVAL_RUN_RECORDED', 'scale_eval_run', run.evalRunId, {
        eval_run_id: run.evalRunId,
        suite: run.suite,
        case_count: run.caseCount,
        pass_count: run.passCount,
        fail_count: run.failCount,
        metric_hash: run.metricHash,
        status_after: run.status,
      });
      return run;
    });
  }

  async listEvalRuns(ctx: PermissionContext): Promise<ScaleEvalRunListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<EvalRunRow>(
      `
        SELECT eval_run_id, suite, case_count, pass_count, fail_count,
          status, metric_hash, evidence_ref, created_at
        FROM scale_eval_runs
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scaleEvalRunListResponseSchema.parse({ runs: result.rows.map(mapEvalRun) });
  }

  async createMigrationDrill(
    ctx: PermissionContext,
    input: CreateScaleMigrationDrillRequestDto,
  ): Promise<ScaleMigrationDrillDto> {
    await this.assertScaleAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<MigrationDrillRow>(
        `
          INSERT INTO scale_migration_drills (
            tenant_id, scope, duration_ms, schema_hash_before,
            schema_hash_after, status, evidence_ref, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING migration_drill_id, scope, duration_ms, schema_hash_before,
            schema_hash_after, status, evidence_ref, created_at
        `,
        [
          ctx.tenantId,
          input.scope,
          input.durationMs,
          input.schemaHashBefore,
          input.schemaHashAfter,
          input.status,
          input.evidenceRef,
          ctx.userId,
        ],
      );
      const drill = mapMigrationDrill(result.rows[0]);
      await this.auditScale(client, ctx, 'SCALE_MIGRATION_DRILL_RECORDED', 'scale_migration_drill', drill.migrationDrillId, {
        migration_drill_id: drill.migrationDrillId,
        scope_type: drill.scope,
        duration_ms: drill.durationMs,
        schema_hash_before: drill.schemaHashBefore,
        schema_hash_after: drill.schemaHashAfter,
        status_after: drill.status,
      });
      return drill;
    });
  }

  async listMigrationDrills(ctx: PermissionContext): Promise<ScaleMigrationDrillListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<MigrationDrillRow>(
      `
        SELECT migration_drill_id, scope, duration_ms, schema_hash_before,
          schema_hash_after, status, evidence_ref, created_at
        FROM scale_migration_drills
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scaleMigrationDrillListResponseSchema.parse({ drills: result.rows.map(mapMigrationDrill) });
  }

  async createLearningEvent(
    ctx: PermissionContext,
    input: CreateScaleLearningEventRequestDto,
  ): Promise<ScaleLearningEventDto> {
    await this.assertScaleAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<LearningEventRow>(
        `
          INSERT INTO scale_learning_events (
            tenant_id, category, severity, pattern_code,
            evidence_ref, resolution_ref, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING learning_event_id, category, severity, pattern_code,
            evidence_ref, resolution_ref, created_at
        `,
        [
          ctx.tenantId,
          input.category,
          input.severity,
          input.patternCode,
          input.evidenceRef,
          input.resolutionRef,
          ctx.userId,
        ],
      );
      const event = mapLearningEvent(result.rows[0]);
      await this.auditScale(client, ctx, 'SCALE_LEARNING_EVENT_RECORDED', 'scale_learning_event', event.learningEventId, {
        learning_event_id: event.learningEventId,
        pattern_code: event.patternCode,
        severity: event.severity,
        evidence_ref: event.evidenceRef,
        resolution_ref: event.resolutionRef,
      });
      return event;
    });
  }

  async listLearningEvents(ctx: PermissionContext): Promise<ScaleLearningEventListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<LearningEventRow>(
      `
        SELECT learning_event_id, category, severity, pattern_code,
          evidence_ref, resolution_ref, created_at
        FROM scale_learning_events
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scaleLearningEventListResponseSchema.parse({ events: result.rows.map(mapLearningEvent) });
  }

  async createAiGateReview(
    ctx: PermissionContext,
    input: CreateScaleAiGateReviewRequestDto,
  ): Promise<ScaleAiGateReviewDto> {
    await this.assertScaleAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<AiGateReviewRow>(
        `
          INSERT INTO scale_ai_gate_reviews (
            tenant_id, candidate_route, decision, external_model_allowed,
            control_hash, evidence_ref, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING ai_gate_review_id, candidate_route, decision,
            external_model_allowed, control_hash, evidence_ref, created_at
        `,
        [
          ctx.tenantId,
          input.candidateRoute,
          input.decision,
          input.externalModelAllowed,
          input.controlHash,
          input.evidenceRef,
          ctx.userId,
        ],
      );
      const review = mapAiGateReview(result.rows[0]);
      await this.auditScale(client, ctx, 'ADVANCED_AI_GATE_REVIEWED', 'scale_ai_gate_review', review.aiGateReviewId, {
        ai_gate_review_id: review.aiGateReviewId,
        candidate_route: review.candidateRoute,
        external_model_allowed: review.externalModelAllowed,
        control_hash: review.controlHash,
        decision_ref: review.decision,
      });
      return review;
    });
  }

  async listAiGateReviews(ctx: PermissionContext): Promise<ScaleAiGateReviewListResponseDto> {
    await this.assertScaleAdmin(ctx);
    const result = await getPool().query<AiGateReviewRow>(
      `
        SELECT ai_gate_review_id, candidate_route, decision,
          external_model_allowed, control_hash, evidence_ref, created_at
        FROM scale_ai_gate_reviews
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return scaleAiGateReviewListResponseSchema.parse({ reviews: result.rows.map(mapAiGateReview) });
  }

  async readiness(ctx: PermissionContext): Promise<ScaleReadinessSummaryDto> {
    await this.assertScaleAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const summary = await readinessSummary(client, ctx.tenantId);
      await this.auditScale(client, ctx, 'SCALE_READINESS_VIEWED', 'scale_readiness', null, {
        readiness_status: summary.technicalPass ? 'technical_pass' : 'gap',
        result_count:
          summary.passingPerformanceRunCount +
          summary.costSnapshotCount +
          summary.passingEvalRunCount +
          summary.passingMigrationDrillCount +
          summary.learningEventCount +
          summary.aiGateReviewCount,
      });
      return summary;
    });
  }

  private async assertScaleAdmin(ctx: PermissionContext): Promise<void> {
    const result = await getPool().query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || !['firm_admin', 'security_admin'].includes(row.role)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async auditScale(
    client: PoolClient,
    ctx: PermissionContext,
    action:
      | 'SCALE_PERFORMANCE_RECORDED'
      | 'SCALE_COST_SNAPSHOT_RECORDED'
      | 'SCALE_EVAL_RUN_RECORDED'
      | 'SCALE_MIGRATION_DRILL_RECORDED'
      | 'SCALE_LEARNING_EVENT_RECORDED'
      | 'ADVANCED_AI_GATE_REVIEWED'
      | 'SCALE_READINESS_VIEWED',
    targetType: string,
    targetId: string | null,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action,
        targetType,
        targetId,
        metadata,
      },
      client,
    );
  }
}

function mapPerformanceRun(row: PerformanceRunRow | undefined): ScalePerformanceRunDto {
  const value = requiredRow(row);
  return scalePerformanceRunSchema.parse({
    performanceRunId: value.performance_run_id,
    scenario: value.scenario,
    sampleCount: value.sample_count,
    p50Ms: value.p50_ms,
    p95Ms: value.p95_ms,
    p99Ms: value.p99_ms,
    targetP95Ms: value.target_p95_ms,
    status: value.status,
    measurementHash: value.measurement_hash,
    evidenceRef: value.evidence_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function mapCostSnapshot(row: CostSnapshotRow | undefined): ScaleCostSnapshotDto {
  const value = requiredRow(row);
  return scaleCostSnapshotSchema.parse({
    costSnapshotId: value.cost_snapshot_id,
    scope: value.scope,
    periodStart: toIsoDate(value.period_start),
    periodEnd: toIsoDate(value.period_end),
    unitCount: Number(value.unit_count),
    estimatedCostCents: Number(value.estimated_cost_cents),
    currency: value.currency,
    costModelHash: value.cost_model_hash,
    evidenceRef: value.evidence_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function mapEvalRun(row: EvalRunRow | undefined): ScaleEvalRunDto {
  const value = requiredRow(row);
  return scaleEvalRunSchema.parse({
    evalRunId: value.eval_run_id,
    suite: value.suite,
    caseCount: value.case_count,
    passCount: value.pass_count,
    failCount: value.fail_count,
    status: value.status,
    metricHash: value.metric_hash,
    evidenceRef: value.evidence_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function mapMigrationDrill(row: MigrationDrillRow | undefined): ScaleMigrationDrillDto {
  const value = requiredRow(row);
  return scaleMigrationDrillSchema.parse({
    migrationDrillId: value.migration_drill_id,
    scope: value.scope,
    durationMs: value.duration_ms,
    schemaHashBefore: value.schema_hash_before,
    schemaHashAfter: value.schema_hash_after,
    status: value.status,
    evidenceRef: value.evidence_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function mapLearningEvent(row: LearningEventRow | undefined): ScaleLearningEventDto {
  const value = requiredRow(row);
  return scaleLearningEventSchema.parse({
    learningEventId: value.learning_event_id,
    category: value.category,
    severity: value.severity,
    patternCode: value.pattern_code,
    evidenceRef: value.evidence_ref,
    resolutionRef: value.resolution_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function mapAiGateReview(row: AiGateReviewRow | undefined): ScaleAiGateReviewDto {
  const value = requiredRow(row);
  return scaleAiGateReviewSchema.parse({
    aiGateReviewId: value.ai_gate_review_id,
    candidateRoute: value.candidate_route,
    decision: value.decision,
    externalModelAllowed: value.external_model_allowed,
    controlHash: value.control_hash,
    evidenceRef: value.evidence_ref,
    createdAt: value.created_at.toISOString(),
  });
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  return row;
}

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

async function readinessSummary(
  client: PoolClient,
  tenantId: string,
): Promise<ScaleReadinessSummaryDto> {
  const result = await client.query<{
    passing_performance_run_count: string;
    cost_snapshot_count: string;
    passing_eval_run_count: string;
    passing_migration_drill_count: string;
    learning_event_count: string;
    ai_gate_review_count: string;
    external_model_allowed_count: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM scale_performance_runs WHERE tenant_id = $1 AND status = 'pass')::text AS passing_performance_run_count,
        (SELECT count(*) FROM scale_cost_snapshots WHERE tenant_id = $1)::text AS cost_snapshot_count,
        (SELECT count(*) FROM scale_eval_runs WHERE tenant_id = $1 AND status = 'pass')::text AS passing_eval_run_count,
        (SELECT count(*) FROM scale_migration_drills WHERE tenant_id = $1 AND status = 'pass')::text AS passing_migration_drill_count,
        (SELECT count(*) FROM scale_learning_events WHERE tenant_id = $1)::text AS learning_event_count,
        (SELECT count(*) FROM scale_ai_gate_reviews WHERE tenant_id = $1)::text AS ai_gate_review_count,
        (SELECT count(*) FROM scale_ai_gate_reviews WHERE tenant_id = $1 AND external_model_allowed IS TRUE)::text AS external_model_allowed_count
    `,
    [tenantId],
  );
  const row = result.rows[0];
  const summary = {
    passingPerformanceRunCount: Number(row?.passing_performance_run_count ?? '0'),
    costSnapshotCount: Number(row?.cost_snapshot_count ?? '0'),
    passingEvalRunCount: Number(row?.passing_eval_run_count ?? '0'),
    passingMigrationDrillCount: Number(row?.passing_migration_drill_count ?? '0'),
    learningEventCount: Number(row?.learning_event_count ?? '0'),
    aiGateReviewCount: Number(row?.ai_gate_review_count ?? '0'),
    externalModelAllowedCount: Number(row?.external_model_allowed_count ?? '0'),
  };
  return scaleReadinessSummarySchema.parse({
    ...summary,
    technicalPass:
      summary.passingPerformanceRunCount > 0 &&
      summary.costSnapshotCount > 0 &&
      summary.passingEvalRunCount > 0 &&
      summary.passingMigrationDrillCount > 0 &&
      summary.learningEventCount > 0 &&
      summary.aiGateReviewCount > 0 &&
      summary.externalModelAllowedCount === 0,
  });
}
