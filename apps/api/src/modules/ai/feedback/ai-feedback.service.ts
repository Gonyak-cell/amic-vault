import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  aiFeedbackMetricsSchema,
  aiFeedbackRequestSchema,
  aiFeedbackResponseSchema,
  type AiFeedbackMetricsDto,
  type AiFeedbackRequestDto,
  type AiFeedbackResponseDto,
} from '@amic-vault/shared';
import { AiAuditRecorder } from '../audit/ai-audit-recorder.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface AiFeedbackRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface AiSessionFeedbackRow {
  ai_session_id: string;
  matter_id: string;
  actor_id: string;
}

interface ActorRoleRow {
  role: string;
  status: string;
}

interface FeedbackInsertRow {
  feedback_item_id: string;
  ai_session_id: string;
  matter_id: string;
  actor_id: string;
  rating: number;
  helpful: boolean | null;
  correction_type: string;
  error_types: string[];
  edit_distance: number;
  created_at: Date;
}

interface FeedbackMetricRow {
  feedback_count: string;
  average_rating: string | null;
  helpful_count: string;
  helpful_total: string;
  correction_count: string;
  hallucination_count: string;
  permission_concern_count: string;
}

@Injectable()
export class AiFeedbackService {
  constructor(@Inject(AiAuditRecorder) private readonly aiAuditRecorder: AiAuditRecorder) {}

  async recordFeedback(
    ctx: AiFeedbackRequestContext,
    input: AiFeedbackRequestDto,
  ): Promise<AiFeedbackResponseDto> {
    const parsed = aiFeedbackRequestSchema.parse(input);
    return withTenantTransaction(ctx.tenantId, async (client) => {
      const session = await this.findSessionForFeedback(client, ctx.tenantId, parsed.sessionId);
      if (!session || !(await this.canRecordFeedback(client, ctx, session))) {
        throw permissionDenied();
      }
      const result = await client.query<FeedbackInsertRow>(
        `
          INSERT INTO feedback_items (
            tenant_id, ai_session_id, matter_id, actor_id, rating, helpful,
            correction_type, error_types, edit_distance
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9)
          RETURNING feedback_item_id, ai_session_id, matter_id, actor_id, rating, helpful,
            correction_type, error_types, edit_distance, created_at
        `,
        [
          ctx.tenantId,
          session.ai_session_id,
          session.matter_id,
          ctx.userId,
          parsed.rating,
          parsed.helpful ?? null,
          parsed.correctionType,
          parsed.errorTypes,
          parsed.editDistance,
        ],
      );
      const row = result.rows[0];
      if (!row) throw permissionDenied();
      await this.aiAuditRecorder.recordFeedback(
        ctx,
        {
          aiSessionId: row.ai_session_id,
          matterId: row.matter_id,
          feedbackId: row.feedback_item_id,
          rating: row.rating,
          helpful: row.helpful,
          correctionType: row.correction_type,
          errorTypes: row.error_types,
          editDistance: row.edit_distance,
        },
        client,
      );
      return aiFeedbackResponseSchema.parse({
        feedbackId: row.feedback_item_id,
        sessionId: row.ai_session_id,
        matterId: row.matter_id,
        recordedByUserId: row.actor_id,
        rating: row.rating,
        helpful: row.helpful,
        correctionType: row.correction_type,
        errorTypes: row.error_types,
        editDistance: row.edit_distance,
        createdAt: row.created_at.toISOString(),
      });
    });
  }

  async getPilotMetrics(
    ctx: AiFeedbackRequestContext,
    matterId: string | null,
  ): Promise<AiFeedbackMetricsDto> {
    await this.assertAdmin(ctx);
    const result = await getPool().query<FeedbackMetricRow>(
      `
        SELECT
          count(*)::text AS feedback_count,
          avg(rating)::text AS average_rating,
          count(*) FILTER (WHERE helpful = true)::text AS helpful_count,
          count(*) FILTER (WHERE helpful IS NOT NULL)::text AS helpful_total,
          count(*) FILTER (WHERE correction_type <> 'none')::text AS correction_count,
          count(*) FILTER (WHERE error_types && ARRAY['hallucination']::text[])::text
            AS hallucination_count,
          count(*) FILTER (WHERE error_types && ARRAY['permission_concern']::text[])::text
            AS permission_concern_count
        FROM feedback_items
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR matter_id = $2::uuid)
      `,
      [ctx.tenantId, matterId],
    );
    const row = result.rows[0];
    const feedbackCount = Number(row?.feedback_count ?? '0');
    const helpfulTotal = Number(row?.helpful_total ?? '0');
    const correctionCount = Number(row?.correction_count ?? '0');
    const hallucinationCount = Number(row?.hallucination_count ?? '0');
    const permissionConcernCount = Number(row?.permission_concern_count ?? '0');
    const averageRating = row?.average_rating === null ? null : Number(row?.average_rating ?? '0');
    const helpfulRate =
      helpfulTotal === 0 ? null : Number(row?.helpful_count ?? '0') / helpfulTotal;
    const correctionRate = feedbackCount === 0 ? 0 : correctionCount / feedbackCount;
    const hallucinationReportRate =
      feedbackCount === 0 ? 0 : hallucinationCount / feedbackCount;

    return aiFeedbackMetricsSchema.parse({
      tenantId: ctx.tenantId,
      matterId,
      feedbackCount,
      averageRating,
      helpfulRate,
      correctionRate,
      hallucinationReportRate,
      permissionConcernCount,
      stopCriteria: [
        {
          code: 'permission_concern_count',
          observed: permissionConcernCount,
          target: 0,
          pass: permissionConcernCount === 0,
        },
        {
          code: 'hallucination_report_rate',
          observed: hallucinationReportRate,
          target: 0.01,
          pass: hallucinationReportRate <= 0.01,
        },
        {
          code: 'correction_rate',
          observed: correctionRate,
          target: 0.2,
          pass: correctionRate <= 0.2,
        },
      ],
    });
  }

  private async findSessionForFeedback(
    client: PoolClient,
    tenantId: string,
    sessionId: string,
  ): Promise<AiSessionFeedbackRow | null> {
    const result = await client.query<AiSessionFeedbackRow>(
      `
        SELECT ai_session_id, matter_id, actor_id
        FROM ai_sessions
        WHERE tenant_id = $1
          AND ai_session_id = $2
        LIMIT 1
      `,
      [tenantId, sessionId],
    );
    return result.rows[0] ?? null;
  }

  private async canRecordFeedback(
    client: PoolClient,
    ctx: AiFeedbackRequestContext,
    session: AiSessionFeedbackRow,
  ): Promise<boolean> {
    if (session.actor_id === ctx.userId) return true;
    const actor = await this.findActor(client, ctx.tenantId, ctx.userId);
    return (
      actor?.status === 'active' &&
      (actor.role === 'firm_admin' || actor.role === 'security_admin')
    );
  }

  private async assertAdmin(ctx: AiFeedbackRequestContext): Promise<void> {
    const actor = await this.findActor(getPool(), ctx.tenantId, ctx.userId);
    if (
      actor?.status !== 'active' ||
      (actor.role !== 'firm_admin' && actor.role !== 'security_admin')
    ) {
      throw permissionDenied();
    }
  }

  private async findActor(
    client: Pick<PoolClient, 'query'>,
    tenantId: string,
    userId: string,
  ): Promise<ActorRoleRow | null> {
    const result = await client.query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    return result.rows[0] ?? null;
  }
}

async function withTenantTransaction<T>(
  tenantId: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function permissionDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}
