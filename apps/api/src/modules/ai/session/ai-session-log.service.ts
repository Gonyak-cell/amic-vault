import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  aiSessionClaimsResponseSchema,
  aiSessionChunkLogSchema,
  aiSessionCreateSchema,
  aiSessionDetailSchema,
  aiSessionListSchema,
  aiSessionPayloadSchema,
  aiSessionResponseLogSchema,
  type AiCitationDto,
  type AiGroundedClaimKind,
  type AiSessionClaimsResponseDto,
  type AiSessionChunkDetailDto,
  type AiSessionChunkLogDto,
  type AiSessionCreateDto,
  type AiSessionDetailDto,
  type AiSessionListDto,
  type AiSessionPayloadDto,
  type AiSessionResponseLogDto,
  type AiSessionStatus,
  type ListAiSessionsQueryDto,
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

interface AiSessionListRow extends AiSessionRow {
  total_count: number | string;
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

interface AiSessionPayloadRow {
  ai_session_payload_id: string;
  ai_session_id: string;
  matter_id: string;
  actor_id: string;
  prompt_text: string;
  response_text: string;
  prompt_hash: string;
  response_hash: string;
  prompt_length: number;
  response_length: number;
  risk_flag: boolean;
  dlp_finding_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ChunkSourceRow {
  matter_id: string;
  text_hash: string;
  source_text_hash: string;
}

export interface AiClaimLedgerInput {
  sessionClaimId: string;
  claimHash: string;
  claimText: string;
  kind: AiGroundedClaimKind;
  citationRefs: readonly string[];
  isLegalConclusion?: boolean;
}

export interface AiSessionPayloadLogInput {
  promptText: string;
  responseText: string;
  riskFlag?: boolean;
  dlpFindingCount?: number;
}

interface AiClaimLedgerRow {
  claim_id: string;
  session_claim_id: string;
  ai_session_id: string;
  claim_hash: string;
  claim_text: string;
  kind: AiGroundedClaimKind;
  is_legal_conclusion: boolean;
  verification_status: 'cited' | 'review_required';
  created_at: Date;
  source_ref: string;
  document_id: string;
  version_id: string;
  chunk_id: string;
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
          requestKind: parsed.requestKind ?? null,
          generationResult: parsed.generationResult ?? null,
          fallbackReasonCode: parsed.fallbackReasonCode ?? null,
        },
        client,
      );
    });
  }

  async recordPayload(
    ctx: AiSessionRequestContext,
    sessionId: string,
    input: AiSessionPayloadLogInput,
  ): Promise<void> {
    const payload = parsePayloadInput(input);
    await withTenantTransaction(ctx.tenantId, async (client) => {
      const session = await this.findOwnedSession(client, ctx, sessionId);
      const promptHash = sha256Hex(payload.promptText);
      const responseHash = sha256Hex(payload.responseText);
      if (
        promptHash !== session.prompt_hash ||
        responseHash !== session.response_hash ||
        payload.promptText.length !== session.prompt_length ||
        payload.responseText.length !== session.response_length
      ) {
        throw validationFailed();
      }

      await client.query(
        `
          INSERT INTO ai_session_payloads (
            tenant_id, ai_session_id, prompt_text, response_text,
            prompt_hash, response_hash, prompt_length, response_length,
            risk_flag, dlp_finding_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (tenant_id, ai_session_id)
          DO UPDATE SET
            prompt_text = EXCLUDED.prompt_text,
            response_text = EXCLUDED.response_text,
            prompt_hash = EXCLUDED.prompt_hash,
            response_hash = EXCLUDED.response_hash,
            prompt_length = EXCLUDED.prompt_length,
            response_length = EXCLUDED.response_length,
            risk_flag = EXCLUDED.risk_flag,
            dlp_finding_count = EXCLUDED.dlp_finding_count,
            updated_at = now()
        `,
        [
          ctx.tenantId,
          session.ai_session_id,
          payload.promptText,
          payload.responseText,
          promptHash,
          responseHash,
          payload.promptText.length,
          payload.responseText.length,
          payload.riskFlag,
          payload.dlpFindingCount,
        ],
      );
    });
  }

  async getSessionPayload(
    ctx: AiSessionRequestContext,
    sessionId: string,
  ): Promise<AiSessionPayloadDto> {
    return withTenantTransaction(ctx.tenantId, async (client) => {
      if (!(await this.canViewPayloadWithClient(client, ctx))) throw payloadPermissionDenied();
      const result = await client.query<AiSessionPayloadRow>(
        `
          SELECT p.ai_session_payload_id, p.ai_session_id, s.matter_id, s.actor_id,
            p.prompt_text, p.response_text, p.prompt_hash, p.response_hash,
            p.prompt_length, p.response_length, p.risk_flag, p.dlp_finding_count,
            p.created_at, p.updated_at
          FROM ai_session_payloads p
          JOIN ai_sessions s
            ON s.tenant_id = p.tenant_id
           AND s.ai_session_id = p.ai_session_id
          WHERE p.tenant_id = $1
            AND p.ai_session_id = $2
          LIMIT 1
        `,
        [ctx.tenantId, sessionId],
      );
      const payload = result.rows[0];
      if (!payload) throw permissionDenied();
      await this.aiAuditRecorder.recordPayloadViewed(
        ctx,
        {
          aiSessionId: payload.ai_session_id,
          matterId: payload.matter_id,
          promptHash: payload.prompt_hash,
          responseHash: payload.response_hash,
          promptLength: payload.prompt_length,
          responseLength: payload.response_length,
          riskFlag: payload.risk_flag,
          dlpFindingCount: payload.dlp_finding_count,
        },
        client,
      );
      return aiSessionPayloadSchema.parse({
        sessionId: payload.ai_session_id,
        matterId: payload.matter_id,
        ownerUserId: payload.actor_id,
        promptText: payload.prompt_text,
        responseText: payload.response_text,
        promptHash: payload.prompt_hash,
        responseHash: payload.response_hash,
        promptLength: payload.prompt_length,
        responseLength: payload.response_length,
        riskFlag: payload.risk_flag,
        dlpFindingCount: payload.dlp_finding_count,
        createdAt: payload.created_at.toISOString(),
        updatedAt: payload.updated_at.toISOString(),
      });
    });
  }

  async recordClaims(
    ctx: AiSessionRequestContext,
    sessionId: string,
    claims: readonly AiClaimLedgerInput[],
    citations: readonly AiCitationDto[],
  ): Promise<void> {
    if (claims.length === 0) throw validationFailed();
    const citationsByRef = new Map(citations.map((citation) => [citation.citationRef, citation]));
    await withTenantTransaction(ctx.tenantId, async (client) => {
      const session = await this.findOwnedSession(client, ctx, sessionId);
      for (const claim of claims) {
        if (claim.citationRefs.length === 0) throw validationFailed();
        const result = await client.query<{ claim_id: string }>(
          `
            INSERT INTO ai_claims (
              tenant_id, ai_session_id, session_claim_id, claim_hash, claim_text,
              kind, is_legal_conclusion, verification_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (tenant_id, ai_session_id, session_claim_id)
            DO UPDATE SET
              claim_hash = EXCLUDED.claim_hash,
              claim_text = EXCLUDED.claim_text,
              kind = EXCLUDED.kind,
              is_legal_conclusion = EXCLUDED.is_legal_conclusion,
              verification_status = EXCLUDED.verification_status,
              updated_at = now()
            RETURNING claim_id
          `,
          [
            ctx.tenantId,
            session.ai_session_id,
            claim.sessionClaimId,
            claim.claimHash,
            claim.claimText,
            claim.kind,
            claim.isLegalConclusion ?? false,
            claim.isLegalConclusion ? 'review_required' : 'cited',
          ],
        );
        const claimId = result.rows[0]?.claim_id;
        if (!claimId) throw validationFailed();
        for (const sourceRef of claim.citationRefs) {
          const citation = citationsByRef.get(sourceRef);
          if (!citation) throw validationFailed();
          await client.query(
            `
              INSERT INTO ai_claim_citations (
                tenant_id, claim_id, source_ref, document_id, version_id, chunk_id
              )
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (tenant_id, claim_id, source_ref) DO NOTHING
            `,
            [
              ctx.tenantId,
              claimId,
              sourceRef,
              citation.documentId,
              citation.versionId,
              citation.chunkId,
            ],
          );
        }
      }
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

  async getSessionClaims(
    ctx: AiSessionRequestContext,
    sessionId: string,
  ): Promise<AiSessionClaimsResponseDto> {
    const session = await this.findSession(ctx.tenantId, sessionId);
    if (!session || !(await this.canViewSession(ctx, session))) throw claimsPermissionDenied();
    const result = await getPool().query<AiClaimLedgerRow>(
      `
        SELECT c.claim_id, c.session_claim_id, c.ai_session_id, c.claim_hash, c.claim_text,
          c.kind, c.is_legal_conclusion, c.verification_status, c.created_at,
          cc.source_ref, cc.document_id, cc.version_id, cc.chunk_id
        FROM ai_claims c
        JOIN ai_claim_citations cc
          ON cc.tenant_id = c.tenant_id
         AND cc.claim_id = c.claim_id
        WHERE c.tenant_id = $1
          AND c.ai_session_id = $2
        ORDER BY c.created_at ASC, c.session_claim_id ASC, cc.source_ref ASC
      `,
      [ctx.tenantId, session.ai_session_id],
    );
    const claims = new Map<string, Omit<AiSessionClaimsResponseDto['claims'][number], 'citations'> & {
      citations: AiSessionClaimsResponseDto['claims'][number]['citations'];
    }>();
    for (const row of result.rows) {
      const current =
        claims.get(row.claim_id) ??
        {
          claimId: row.claim_id,
          sessionClaimId: row.session_claim_id,
          sessionId: row.ai_session_id,
          claimHash: row.claim_hash,
          claimText: row.claim_text,
          kind: row.kind,
          isLegalConclusion: row.is_legal_conclusion,
          verificationStatus: row.verification_status,
          citations: [],
          createdAt: row.created_at.toISOString(),
        };
      current.citations.push({
        sourceRef: row.source_ref,
        documentId: row.document_id,
        versionId: row.version_id,
        chunkId: row.chunk_id,
      });
      claims.set(row.claim_id, current);
    }
    return aiSessionClaimsResponseSchema.parse({
      sessionId: session.ai_session_id,
      claims: [...claims.values()],
    });
  }

  async listSessions(
    ctx: AiSessionRequestContext,
    input: ListAiSessionsQueryDto,
  ): Promise<AiSessionListDto> {
    if (input.matterId) await this.assertCanReadMatter(ctx, input.matterId);
    const page = input.page;
    const pageSize = input.pageSize;
    const offset = (page - 1) * pageSize;
    const params = input.matterId
      ? [ctx.tenantId, input.matterId, pageSize, offset]
      : [ctx.tenantId, ctx.userId, pageSize, offset];
    const scopeSql = input.matterId ? 'matter_id = $2' : 'actor_id = $2';
    const result = await getPool().query<AiSessionListRow>(
      `
        SELECT ai_session_id, matter_id, actor_id, auth_session_id, model_route, status,
          prompt_hash, prompt_length, response_hash, response_length, response_token_count,
          latency_ms, escalation_required, blocked_reason, created_at, updated_at,
          count(*) OVER()::int AS total_count
        FROM ai_sessions
        WHERE tenant_id = $1
          AND ${scopeSql}
        ORDER BY created_at DESC, ai_session_id DESC
        LIMIT $3 OFFSET $4
      `,
      params,
    );
    const totalCount = Number(result.rows[0]?.total_count ?? 0);
    return aiSessionListSchema.parse({
      items: result.rows.map((row) => ({
        sessionId: row.ai_session_id,
        matterId: row.matter_id,
        ownerUserId: row.actor_id,
        modelRoute: row.model_route,
        status: row.status,
        responseTokenCount: row.response_token_count,
        latencyMs: row.latency_ms,
        escalationRequired: row.escalation_required,
        blockedReason: row.blocked_reason,
        policySummary: aiSessionPolicySummary(row),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
      totalCount,
      page,
      pageSize,
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

  private async canViewPayloadWithClient(
    client: PoolClient,
    ctx: AiSessionRequestContext,
  ): Promise<boolean> {
    const result = await client.query<{ role: string; status: string }>(
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
    return actor?.status === 'active' && actor.role === 'security_admin';
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

function payloadPermissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function claimsPermissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function aiSessionPolicySummary(session: Pick<AiSessionRow, 'blocked_reason' | 'escalation_required'>) {
  if (session.blocked_reason) return session.blocked_reason;
  if (session.escalation_required) return 'escalation_required';
  return 'allowed';
}

function parsePayloadInput(input: AiSessionPayloadLogInput): Required<AiSessionPayloadLogInput> {
  if (
    typeof input.promptText !== 'string' ||
    typeof input.responseText !== 'string' ||
    input.promptText.length > 20000 ||
    input.responseText.length > 20000
  ) {
    throw validationFailed();
  }
  const risk = normalizeAiSessionPayloadRisk(input);
  return {
    promptText: input.promptText,
    responseText: input.responseText,
    riskFlag: risk.riskFlag,
    dlpFindingCount: risk.dlpFindingCount,
  };
}

export function normalizeAiSessionPayloadRisk(input: {
  riskFlag?: boolean;
  dlpFindingCount?: number;
}): { riskFlag: boolean; dlpFindingCount: number } {
  const dlpFindingCount = input.dlpFindingCount ?? 0;
  if (
    !Number.isInteger(dlpFindingCount) ||
    dlpFindingCount < 0 ||
    dlpFindingCount > 10000
  ) {
    throw validationFailed();
  }
  return {
    dlpFindingCount,
    riskFlag: input.riskFlag ?? dlpFindingCount > 0,
  };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
