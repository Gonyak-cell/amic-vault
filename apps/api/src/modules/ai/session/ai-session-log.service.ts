import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  aiSessionChunkLogSchema,
  aiSessionCreateSchema,
  aiSessionDetailSchema,
  aiSessionResponseLogSchema,
  type AiSessionChunkDetailDto,
  type AiSessionChunkLogDto,
  type AiSessionCreateDto,
  type AiSessionDetailDto,
  type AiSessionResponseLogDto,
  type AiSessionStatus,
} from '@amic-vault/shared';
import { AiAuditRecorder } from '../audit/ai-audit-recorder.service';
import { DocumentPermissionService } from '../../permission/document-permission.service';
import { PermissionService } from '../../permission/permission.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface AiSessionRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface AiSessionRow {
  ai_session_id: string;
  matter_id: string;
  actor_id: string;
  auth_session_id: string | null;
  model_route: 'local_gemma';
  status: AiSessionStatus;
  prompt_hash: string;
  prompt_length: number;
  response_hash: string | null;
  response_length: number | null;
  response_token_count: number | null;
  latency_ms: number | null;
  escalation_required: boolean;
  blocked_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AiSessionChunkRow {
  document_id: string;
  version_id: string;
  chunk_id: string;
  included: boolean;
  reason_code: AiSessionChunkLogDto['reasonCode'];
  rank_index: number | null;
  score: number | null;
  quote_hash: string;
  source_text_hash: string;
}

interface ChunkSourceRow {
  matter_id: string;
  text_hash: string;
  source_text_hash: string;
}

@Injectable()
export class AiSessionLogService {
  constructor(
    @Inject(PermissionService)
    private readonly permissionService: Pick<PermissionService, 'canReadMatter'>,
    @Inject(DocumentPermissionService)
    private readonly documentPermissionService: Pick<DocumentPermissionService, 'canReadDocument'>,
    @Inject(AiAuditRecorder) private readonly aiAuditRecorder: AiAuditRecorder,
  ) {}

  async createSession(
    ctx: AiSessionRequestContext,
    input: AiSessionCreateDto,
  ): Promise<{ sessionId: string }> {
    const parsed = aiSessionCreateSchema.parse(input);
    await this.assertCanReadMatter(ctx, parsed.matterId);
    return withTenantTransaction(ctx.tenantId, async (client) => {
      const result = await client.query<{ ai_session_id: string }>(
        `
          INSERT INTO ai_sessions (
            tenant_id, matter_id, actor_id, auth_session_id, model_route, status,
            prompt_hash, prompt_length, escalation_required, blocked_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING ai_session_id
        `,
        [
          ctx.tenantId,
          parsed.matterId,
          ctx.userId,
          ctx.sessionId ?? null,
          parsed.modelRoute,
          parsed.blockedReason ? 'blocked' : 'submitted',
          parsed.promptHash,
          parsed.promptLength,
          parsed.escalationRequired ?? false,
          parsed.blockedReason ?? null,
        ],
      );
      const sessionId = result.rows[0]?.ai_session_id;
      if (!sessionId) throw permissionDenied();
      await this.aiAuditRecorder.recordQuerySubmitted(
        ctx,
        {
          aiSessionId: sessionId,
          matterId: parsed.matterId,
          modelRoute: parsed.modelRoute,
        },
        client,
      );
      return { sessionId };
    });
  }

  async recordRetrievedChunks(
    ctx: AiSessionRequestContext,
    sessionId: string,
    chunks: readonly AiSessionChunkLogDto[],
  ): Promise<void> {
    const parsedChunks = chunks.map((chunk) => aiSessionChunkLogSchema.parse(chunk));
    await withTenantTransaction(ctx.tenantId, async (client) => {
      const session = await this.findOwnedSession(client, ctx, sessionId);
      for (const chunk of parsedChunks) {
        await this.assertChunkBelongsToSessionMatter(client, ctx.tenantId, session, chunk);
        await client.query(
          `
            INSERT INTO ai_session_chunks (
              tenant_id, ai_session_id, document_id, version_id, chunk_id,
              included, reason_code, rank_index, score, quote_hash, source_text_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tenant_id, ai_session_id, chunk_id)
            DO UPDATE SET
              included = EXCLUDED.included,
              reason_code = EXCLUDED.reason_code,
              rank_index = EXCLUDED.rank_index,
              score = EXCLUDED.score,
              quote_hash = EXCLUDED.quote_hash,
              source_text_hash = EXCLUDED.source_text_hash
          `,
          [
            ctx.tenantId,
            session.ai_session_id,
            chunk.documentId,
            chunk.versionId,
            chunk.chunkId,
            chunk.included,
            chunk.reasonCode,
            chunk.rankIndex ?? null,
            chunk.score ?? null,
            chunk.quoteHash,
            chunk.sourceTextHash,
          ],
        );
      }
      await client.query(
        `
          UPDATE ai_sessions
          SET status = CASE WHEN status = 'submitted' THEN 'retrieved' ELSE status END,
            updated_at = now()
          WHERE tenant_id = $1
            AND ai_session_id = $2
        `,
        [ctx.tenantId, session.ai_session_id],
      );
      await this.aiAuditRecorder.recordRetrieval(
        ctx,
        {
          aiSessionId: session.ai_session_id,
          matterId: session.matter_id,
          chunks: parsedChunks,
        },
        client,
      );
    });
  }

  async recordResponse(
    ctx: AiSessionRequestContext,
    sessionId: string,
    input: AiSessionResponseLogDto,
  ): Promise<void> {
    const parsed = aiSessionResponseLogSchema.parse(input);
    await withTenantTransaction(ctx.tenantId, async (client) => {
      const session = await this.findOwnedSession(client, ctx, sessionId);
      const status = parsed.status ?? 'responded';
      const escalationRequired = parsed.escalationRequired ?? session.escalation_required;
      const blockedReason = parsed.blockedReason ?? session.blocked_reason;
      await client.query(
        `
          UPDATE ai_sessions
          SET response_hash = $3,
            response_length = $4,
            response_token_count = $5,
            latency_ms = $6,
            status = $7,
            escalation_required = $8,
            blocked_reason = $9,
            updated_at = now()
          WHERE tenant_id = $1
            AND ai_session_id = $2
        `,
        [
          ctx.tenantId,
          session.ai_session_id,
          parsed.responseHash,
          parsed.responseLength,
          parsed.responseTokenCount ?? null,
          parsed.latencyMs ?? null,
          status,
          escalationRequired,
          blockedReason,
        ],
      );
      await this.aiAuditRecorder.recordResponse(
        ctx,
        {
          aiSessionId: session.ai_session_id,
          matterId: session.matter_id,
          responseHash: parsed.responseHash,
          responseLength: parsed.responseLength,
          responseTokenCount: parsed.responseTokenCount ?? null,
          latencyMs: parsed.latencyMs ?? null,
          status,
          blockedReason,
          escalationRequired,
        },
        client,
      );
    });
  }

  async getSessionDetail(
    ctx: AiSessionRequestContext,
    sessionId: string,
  ): Promise<AiSessionDetailDto> {
    const session = await this.findSession(ctx.tenantId, sessionId);
    if (!session || !(await this.canViewSession(ctx, session))) throw permissionDenied();

    const rows = await this.findSessionChunks(ctx.tenantId, session.ai_session_id);
    const chunks: AiSessionChunkDetailDto[] = [];
    let hiddenSourceCount = 0;
    for (const row of rows) {
      if (!(await this.canReadSource(ctx, row.document_id))) {
        hiddenSourceCount += 1;
        continue;
      }
      if (chunks.length >= 50) {
        hiddenSourceCount += 1;
        continue;
      }
      chunks.push({
        documentId: row.document_id,
        versionId: row.version_id,
        chunkId: row.chunk_id,
        included: row.included,
        reasonCode: row.reason_code,
        rankIndex: row.rank_index,
        score: row.score,
        quoteHash: row.quote_hash,
        sourceTextHash: row.source_text_hash,
      });
    }

    return aiSessionDetailSchema.parse({
      sessionId: session.ai_session_id,
      matterId: session.matter_id,
      ownerUserId: session.actor_id,
      authSessionId: session.auth_session_id,
      modelRoute: session.model_route,
      status: session.status,
      promptHash: session.prompt_hash,
      promptLength: session.prompt_length,
      responseHash: session.response_hash,
      responseLength: session.response_length,
      responseTokenCount: session.response_token_count,
      latencyMs: session.latency_ms,
      escalationRequired: session.escalation_required,
      blockedReason: session.blocked_reason,
      chunks,
      hiddenSourceCount,
      createdAt: session.created_at.toISOString(),
      updatedAt: session.updated_at.toISOString(),
    });
  }

  private async assertCanReadMatter(
    ctx: AiSessionRequestContext,
    matterId: string,
  ): Promise<void> {
    let decision: Awaited<ReturnType<PermissionService['canReadMatter']>> | undefined;
    try {
      decision = await this.permissionService.canReadMatter(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        matterId,
      );
    } catch {
      decision = undefined;
    }
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  private async findOwnedSession(
    client: PoolClient,
    ctx: AiSessionRequestContext,
    sessionId: string,
  ): Promise<AiSessionRow> {
    const session = await this.findSessionWithClient(client, ctx.tenantId, sessionId);
    if (!session || session.actor_id !== ctx.userId) throw permissionDenied();
    return session;
  }

  private async assertChunkBelongsToSessionMatter(
    client: PoolClient,
    tenantId: string,
    session: AiSessionRow,
    chunk: AiSessionChunkLogDto,
  ): Promise<void> {
    const result = await client.query<ChunkSourceRow>(
      `
        SELECT d.matter_id, dc.text_hash, dc.source_text_hash
        FROM document_chunks dc
        JOIN documents d
          ON d.tenant_id = dc.tenant_id
         AND d.document_id = dc.document_id
        WHERE dc.tenant_id = $1
          AND dc.document_id = $2
          AND dc.version_id = $3
          AND dc.chunk_id = $4
          AND dc.stale = false
        LIMIT 1
      `,
      [tenantId, chunk.documentId, chunk.versionId, chunk.chunkId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.matter_id !== session.matter_id ||
      row.text_hash !== chunk.quoteHash ||
      row.source_text_hash !== chunk.sourceTextHash
    ) {
      throw permissionDenied();
    }
  }

  private async canViewSession(
    ctx: AiSessionRequestContext,
    session: AiSessionRow,
  ): Promise<boolean> {
    if (session.actor_id === ctx.userId) return true;
    const result = await getPool().query<{ role: string; status: string }>(
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
    return (
      actor?.status === 'active' &&
      (actor.role === 'firm_admin' || actor.role === 'security_admin')
    );
  }

  private async canReadSource(ctx: AiSessionRequestContext, documentId: string): Promise<boolean> {
    try {
      const decision = await this.documentPermissionService.canReadDocument(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        documentId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      return false;
    }
  }

  private async findSession(tenantId: string, sessionId: string): Promise<AiSessionRow | null> {
    const result = await getPool().query<AiSessionRow>(sessionQuery, [tenantId, sessionId]);
    return result.rows[0] ?? null;
  }

  private async findSessionWithClient(
    client: PoolClient,
    tenantId: string,
    sessionId: string,
  ): Promise<AiSessionRow | null> {
    const result = await client.query<AiSessionRow>(sessionQuery, [tenantId, sessionId]);
    return result.rows[0] ?? null;
  }

  private async findSessionChunks(
    tenantId: string,
    sessionId: string,
  ): Promise<AiSessionChunkRow[]> {
    const result = await getPool().query<AiSessionChunkRow>(
      `
        SELECT document_id, version_id, chunk_id, included, reason_code, rank_index,
          score, quote_hash, source_text_hash
        FROM ai_session_chunks
        WHERE tenant_id = $1
          AND ai_session_id = $2
        ORDER BY included DESC, rank_index ASC NULLS LAST, created_at ASC, chunk_id ASC
        LIMIT 200
      `,
      [tenantId, sessionId],
    );
    return result.rows;
  }
}

const sessionQuery = `
  SELECT ai_session_id, matter_id, actor_id, auth_session_id, model_route, status,
    prompt_hash, prompt_length, response_hash, response_length, response_token_count,
    latency_ms, escalation_required, blocked_reason, created_at, updated_at
  FROM ai_sessions
  WHERE tenant_id = $1
    AND ai_session_id = $2
  LIMIT 1
`;

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
