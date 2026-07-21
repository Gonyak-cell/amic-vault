import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiSessionLogService } from '../../apps/api/src/modules/ai/session/ai-session-log.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentSecurity,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface SessionSourceFixture {
  documentId: string;
  versionId: string;
  chunkId: string;
  quoteHash: string;
  sourceTextHash: string;
  rawText: string;
}

interface AiSessionDetailResponse {
  sessionId: string;
  ownerUserId: string;
  promptHash: string;
  responseHash: string | null;
  chunks: Array<{ documentId: string }>;
  hiddenSourceCount: number;
}

interface AiSessionListResponse {
  items: Array<{
    sessionId: string;
    matterId: string;
    modelRoute: string;
    policySummary: string;
  }>;
  totalCount: number;
}

interface AiSessionPayloadResponse {
  sessionId: string;
  matterId: string;
  ownerUserId: string;
  promptText: string;
  responseText: string;
  promptHash: string;
  responseHash: string;
  promptLength: number;
  responseLength: number;
  riskFlag: boolean;
  dlpFindingCount: number;
}

interface AiMatterQaResponse {
  sessionId: string;
  matterId: string;
  task: 'matter_qa';
  modelRoute: 'local_gemma';
  legalConclusionAutoApproval: false;
  citations: Array<{ documentId: string }>;
  sections: Array<{ citationRefs: string[] }>;
}

describe('AI session log integration', () => {
  const marker = `ai-session-${randomUUID()}`;
  const promptPayload = `${marker} prompt hash input only`;
  const responsePayload = `${marker} response hash input only for audit payload`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let adminCookie: string;
  let securityAdminCookie: string;
  let visible: SessionSourceFixture;
  let hidden: SessionSourceFixture;
  let sessionId: string;

  beforeAll(async () => {
    visible = await insertSessionSource({
      title: `${marker} Visible Memo`,
      contentText: `${marker} visible source text`,
      index: 971,
    });
    hidden = await insertSessionSource({
      title: `${marker} Later Restricted Memo`,
      contentText: `${marker} hidden source text`,
      index: 972,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await enableAiPolicyForMatter(matterId);

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    securityAdminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });

    const sessions = app.get(AiSessionLogService);
    const context = { tenantId: tenantAlphaId, userId: alphaOwnerUserId };
    const created = await sessions.createSession(context, {
      matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex(promptPayload),
      promptLength: promptPayload.length,
    });
    sessionId = created.sessionId;
    await sessions.recordRetrievedChunks(context, sessionId, [
      {
        documentId: visible.documentId,
        versionId: visible.versionId,
        chunkId: visible.chunkId,
        included: true,
        reasonCode: 'included',
        rankIndex: 0,
        score: 1,
        quoteHash: visible.quoteHash,
        sourceTextHash: visible.sourceTextHash,
      },
      {
        documentId: hidden.documentId,
        versionId: hidden.versionId,
        chunkId: hidden.chunkId,
        included: false,
        reasonCode: 'permission_denied',
        quoteHash: hidden.quoteHash,
        sourceTextHash: hidden.sourceTextHash,
      },
    ]);
    await sessions.recordResponse(context, sessionId, {
      responseHash: sha256Hex(responsePayload),
      responseLength: responsePayload.length,
      responseTokenCount: 12,
      latencyMs: 42,
    });
    await sessions.recordPayload(context, sessionId, {
      promptText: promptPayload,
      responseText: responsePayload,
      dlpFindingCount: 2,
    });
    await setDocumentSecurity({
      tenantId: tenantAlphaId,
      documentId: hidden.documentId,
      confidentialityLevel: 'restricted',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates tenant-scoped AI session schema with raw payloads isolated to a FORCE RLS table', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('ai_sessions', 'ai_session_chunks', 'ai_session_payloads')
          ORDER BY table_name, ordinal_position
        `,
      );
      const names = columns.rows.map((row) => `${row.table_name}.${row.column_name}`);
      expect(names).toContain('ai_sessions.tenant_id');
      expect(names).toContain('ai_session_chunks.tenant_id');
      expect(names).toContain('ai_session_payloads.tenant_id');
      expect(names).toContain('ai_session_payloads.prompt_text');
      expect(names).toContain('ai_session_payloads.response_text');
      expect(
        names
          .filter((name) => !name.startsWith('ai_session_payloads.'))
          .join('\n'),
      ).not.toMatch(/prompt_text|response_text|body|content|snippet|raw/i);

      const rls = await client.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `
          SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
          WHERE relname IN ('ai_sessions', 'ai_session_chunks', 'ai_session_payloads')
          ORDER BY relname
        `,
      );
      expect(rls.rows).toEqual([
        { relname: 'ai_session_chunks', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'ai_session_payloads', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'ai_sessions', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });
  });

  it('returns owner session details with prompt/response hashes and permission-rechecked sources', async () => {
    const detail = await getSessionDetail(ownerCookie, sessionId, 200);

    expect(detail.sessionId).toBe(sessionId);
    expect(detail.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.chunks.map((chunk) => chunk.documentId)).toEqual([visible.documentId]);
    expect(detail.hiddenSourceCount).toBe(1);
    const json = JSON.stringify(detail);
    expect(json).not.toContain(hidden.documentId);
    expect(json).not.toContain(visible.rawText);
    expect(json).not.toContain(hidden.rawText);
  });

  it('records the mandatory AI audit events without prompt response or source text', async () => {
    const audits = await aiAuditEvents(sessionId);
    expect(audits.map((audit) => audit.action)).toEqual([
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_RESPONSE',
    ]);

    expect(audits[0]?.metadata_json).toMatchObject({
      ai_session_id: sessionId,
      matter_id: matterId,
      model_route: 'local_gemma',
    });
    expect(audits[1]?.metadata_json).toMatchObject({
      ai_session_id: sessionId,
      matter_id: matterId,
      included_count: 1,
      excluded_count: 1,
      included_chunk_ids: [visible.chunkId],
      excluded_chunk_ids: [hidden.chunkId],
    });
    expect(audits[2]?.metadata_json).toMatchObject({
      ai_session_id: sessionId,
      matter_id: matterId,
      excluded_count: 1,
      excluded_chunk_ids: [hidden.chunkId],
    });
    expect(audits[3]?.metadata_json).toMatchObject({
      ai_session_id: sessionId,
      matter_id: matterId,
      response_length: responsePayload.length,
      response_token_count: 12,
      duration_ms: 42,
      ai_response_status: 'responded',
      escalation_required: false,
    });
    expect(audits[3]?.metadata_json.hash).toMatch(/^[0-9a-f]{64}$/);

    const rawAudit = audits.map((audit) => audit.raw_metadata).join('\n');
    expect(rawAudit).not.toContain(promptPayload);
    expect(rawAudit).not.toContain(responsePayload);
    expect(rawAudit).not.toContain(visible.rawText);
    expect(rawAudit).not.toContain(hidden.rawText);
    expect(rawAudit).not.toMatch(/body|content|snippet|raw|prompt_text|response_text/i);
  });

  it('lets authorized admins view session metadata while rechecking source permission', async () => {
    const detail = await getSessionDetail(adminCookie, sessionId, 200);

    expect(detail.sessionId).toBe(sessionId);
    expect(detail.ownerUserId).toBe(alphaOwnerUserId);
    expect(detail.chunks).toEqual([]);
    expect(detail.hiddenSourceCount).toBe(2);
  });

  it('lets security admins view stored AI payloads and audits that view without leaking payload text', async () => {
    const lawyerDenied = await fetch(`${baseUrl}/v1/ai/sessions/${sessionId}/payload`, {
      headers: { cookie: memberCookie },
    });
    expect(lawyerDenied.status).toBe(403);
    expect(await lawyerDenied.text()).toContain('PERMISSION_DENIED');

    const firmAdminDenied = await fetch(`${baseUrl}/v1/ai/sessions/${sessionId}/payload`, {
      headers: { cookie: adminCookie },
    });
    expect(firmAdminDenied.status).toBe(403);
    expect(await firmAdminDenied.text()).toContain('PERMISSION_DENIED');

    const payload = await getSessionPayload(securityAdminCookie, sessionId, 200);
    expect(payload).toMatchObject({
      sessionId,
      matterId,
      ownerUserId: alphaOwnerUserId,
      promptText: promptPayload,
      responseText: responsePayload,
      promptHash: sha256Hex(promptPayload),
      responseHash: sha256Hex(responsePayload),
      promptLength: promptPayload.length,
      responseLength: responsePayload.length,
      riskFlag: true,
      dlpFindingCount: 2,
    });

    const rows = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        prompt_hash: string;
        risk_flag: boolean;
        dlp_finding_count: number;
      }>(
        `
          SELECT prompt_hash, risk_flag, dlp_finding_count
          FROM ai_session_payloads
          WHERE tenant_id = $1
            AND ai_session_id = $2
        `,
        [tenantAlphaId, sessionId],
      );
      return result.rows;
    });
    expect(rows).toEqual([
      {
        prompt_hash: sha256Hex(promptPayload),
        risk_flag: true,
        dlp_finding_count: 2,
      },
    ]);

    const alphaRows = await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ prompt_text: string }>(
        `
          SELECT prompt_text
          FROM ai_session_payloads
          WHERE ai_session_id = $1
        `,
        [sessionId],
      );
      return result.rows;
    });
    expect(alphaRows).toEqual([{ prompt_text: promptPayload }]);

    const betaRows = await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query<{ prompt_text: string }>(
        `
          SELECT prompt_text
          FROM ai_session_payloads
          WHERE ai_session_id = $1
        `,
        [sessionId],
      );
      return result.rows;
    });
    expect(betaRows).toEqual([]);

    const payloadView = (await aiAuditEvents(sessionId)).find(
      (audit) => audit.action === 'AI_PAYLOAD_VIEWED',
    );
    expect(payloadView?.metadata_json).toMatchObject({
      ai_session_id: sessionId,
      matter_id: matterId,
      prompt_hash: sha256Hex(promptPayload),
      response_hash: sha256Hex(responsePayload),
      query_length: promptPayload.length,
      response_length: responsePayload.length,
      risk_flag: true,
      dlp_finding_count: 2,
    });
    expect(payloadView?.raw_metadata).not.toContain(promptPayload);
    expect(payloadView?.raw_metadata).not.toContain(responsePayload);
    expect(payloadView?.raw_metadata).not.toMatch(/prompt_text|response_text|body|content|snippet|raw/i);
  });

  it('fails closed for non-owner non-admin session detail access', async () => {
    const response = await fetch(`${baseUrl}/v1/ai/sessions/${sessionId}`, {
      headers: { cookie: memberCookie },
    });
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).not.toContain(sessionId);
    expect(body).not.toContain(visible.documentId);
  });

  it('lists matter-scoped sessions in descending paginated order', async () => {
    const sessions = app.get(AiSessionLogService);
    const context = { tenantId: tenantAlphaId, userId: alphaOwnerUserId };
    const middleSession = await sessions.createSession(context, {
      matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex(`middle session ${randomUUID()}`),
      promptLength: 18,
    });
    const newestSession = await sessions.createSession(context, {
      matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex(`newest session ${randomUUID()}`),
      promptLength: 18,
    });
    const otherSessionId = await insertOtherMatterSession();
    await setSessionTimes([
      [sessionId, '2026-07-01T00:00:00.000Z'],
      [middleSession.sessionId, '2026-07-02T00:00:00.000Z'],
      [newestSession.sessionId, '2026-07-03T00:00:00.000Z'],
      [otherSessionId, '2026-07-04T00:00:00.000Z'],
    ]);

    const firstPage = await getSessionList(
      ownerCookie,
      `/v1/ai/sessions?matterId=${matterId}&page=1&pageSize=2`,
    );
    expect(firstPage.totalCount).toBe(3);
    expect(firstPage.items.map((item) => item.sessionId)).toEqual([
      newestSession.sessionId,
      middleSession.sessionId,
    ]);
    expect(firstPage.items[0]).toMatchObject({
      matterId,
      modelRoute: 'local_gemma',
      policySummary: 'allowed',
    });

    const secondPage = await getSessionList(
      ownerCookie,
      `/v1/ai/sessions?matterId=${matterId}&page=2&pageSize=2`,
    );
    expect(secondPage.items.map((item) => item.sessionId)).toEqual([sessionId]);
    expect(JSON.stringify(firstPage)).not.toContain(otherSessionId);
    expect(JSON.stringify(secondPage)).not.toContain(otherSessionId);
  });

  it('creates search-seeded matter QA sessions with citations from permitted documents only', async () => {
    const query = `${marker} visible hidden source text`;
    const summary = await postMatterQuestion(query);

    expect(summary).toMatchObject({
      matterId,
      task: 'matter_qa',
      modelRoute: 'local_gemma',
      legalConclusionAutoApproval: false,
    });
    expect(summary.citations.map((citation) => citation.documentId)).toEqual([visible.documentId]);
    expect(summary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
    const rawSummary = JSON.stringify(summary);
    expect(rawSummary).not.toContain(hidden.documentId);
    expect(rawSummary).not.toContain(hidden.rawText);

    const chunks = await aiSessionChunks(summary.sessionId);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: visible.documentId,
          included: true,
          reason_code: 'included',
        }),
      ]),
    );
    expect(chunks.some((chunk) => chunk.document_id === hidden.documentId && chunk.included)).toBe(
      false,
    );
  });

  async function insertSessionSource(input: {
    title: string;
    contentText: string;
    index: number;
  }): Promise<SessionSourceFixture> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId,
        versionId,
        title: input.title,
        contentText: input.contentText,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-25T00:00:00.000Z',
        aiAllowed: true,
      },
      input.index,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId,
      versionId,
      contentText: input.contentText,
    });
    const chunk = await firstChildChunk(documentId, versionId);
    return {
      documentId,
      versionId,
      chunkId: chunk.chunk_id,
      quoteHash: chunk.text_hash,
      sourceTextHash: chunk.source_text_hash,
      rawText: input.contentText,
    };
  }

  async function getSessionDetail(
    cookie: string,
    id: string,
    expectedStatus: number,
  ): Promise<AiSessionDetailResponse> {
    const response = await fetch(`${baseUrl}/v1/ai/sessions/${id}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(expectedStatus);
    return JSON.parse(text) as AiSessionDetailResponse;
  }

  async function postMatterQuestion(query: string): Promise<AiMatterQaResponse> {
    const response = await fetch(`${baseUrl}/v1/ai/summaries`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        task: 'matter_qa',
        query,
        filters: { matterId },
        maxChunks: 3,
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as AiMatterQaResponse;
  }

  async function aiSessionChunks(sessionId: string): Promise<
    {
      document_id: string;
      included: boolean;
      reason_code: string;
    }[]
  > {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        document_id: string;
        included: boolean;
        reason_code: string;
      }>(
        `
          SELECT document_id, included, reason_code
          FROM ai_session_chunks
          WHERE tenant_id = $1
            AND ai_session_id = $2
          ORDER BY included DESC, reason_code ASC, document_id ASC
        `,
        [tenantAlphaId, sessionId],
      );
      return result.rows;
    });
  }

  async function getSessionList(cookie: string, path: string): Promise<AiSessionListResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as AiSessionListResponse;
  }

  async function getSessionPayload(
    cookie: string,
    id: string,
    expectedStatus: number,
  ): Promise<AiSessionPayloadResponse> {
    const response = await fetch(`${baseUrl}/v1/ai/sessions/${id}/payload`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(expectedStatus);
    return JSON.parse(text) as AiSessionPayloadResponse;
  }
});

async function enableAiPolicyForMatter(matterId: string): Promise<void> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO ai_policies (
          policy_id, tenant_id, name, allowed_model_tiers,
          summary_generation_enabled, session_payload_preservation_enabled
        )
        VALUES ($1, $2, 'D10 search QA local policy', ARRAY['local']::text[], false, true)
      `,
      [policyId, tenantAlphaId],
    );
    await client.query(
      `
        INSERT INTO ai_model_access_policies (
          access_policy_id, tenant_id, route_key, model_tier, status
        )
        VALUES ($1, $2, 'local_gemma', 'local', 'enabled')
        ON CONFLICT (tenant_id, route_key)
        DO UPDATE SET status = 'enabled', updated_at = now()
      `,
      [accessPolicyId, tenantAlphaId],
    );
    await client.query(
      `
        UPDATE matters
        SET ai_policy_id = $3,
          updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId, policyId],
    );
  });
}

async function insertOtherMatterSession(): Promise<string> {
  const clientId = randomUUID();
  const matterId = randomUUID();
  const sessionId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, 'AI session list other client', $3)
      `,
      [clientId, tenantAlphaId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, lead_lawyer_id, created_by, access_scope
        )
        VALUES ($1, $2, $3, $4, 'AI session list other matter', 'advisory',
          'active', $5, $5, 'restricted')
      `,
      [matterId, tenantAlphaId, clientId, `AI-${randomUUID()}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO ai_sessions (
          ai_session_id, tenant_id, matter_id, actor_id, model_route, status,
          prompt_hash, prompt_length, escalation_required
        )
        VALUES ($1, $2, $3, $4, 'local_gemma', 'submitted', $5, 12, false)
      `,
      [sessionId, tenantAlphaId, matterId, alphaOwnerUserId, sha256Hex(`other:${sessionId}`)],
    );
  });
  return sessionId;
}

async function setSessionTimes(entries: Array<[string, string]>): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    for (const [id, createdAt] of entries) {
      await client.query(
        `
          UPDATE ai_sessions
          SET created_at = $3::timestamptz,
              updated_at = $3::timestamptz
          WHERE tenant_id = $1
            AND ai_session_id = $2
        `,
        [tenantAlphaId, id, createdAt],
      );
    }
  });
}

async function aiAuditEvents(sessionId: string): Promise<
  {
    action: string;
    target_type: string;
    target_id: string | null;
    result: string;
    metadata_json: Record<string, unknown>;
    raw_metadata: string;
  }[]
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      action: string;
      target_type: string;
      target_id: string | null;
      result: string;
      metadata_json: Record<string, unknown>;
      raw_metadata: string;
    }>(
      `
        SELECT action, target_type, target_id::text, result, metadata_json,
          metadata_json::text AS raw_metadata
        FROM audit_events
        WHERE tenant_id = $1
          AND action IN (
            'AI_QUERY_SUBMITTED',
            'AI_RETRIEVAL',
            'AI_RESPONSE',
            'AI_RETRIEVAL_EXCLUDED',
            'AI_PAYLOAD_VIEWED'
          )
          AND metadata_json->>'ai_session_id' = $2
        ORDER BY seq ASC
      `,
      [tenantAlphaId, sessionId],
    );
    return result.rows;
  });
}

async function firstChildChunk(
  documentId: string,
  versionId: string,
): Promise<{ chunk_id: string; text_hash: string; source_text_hash: string }> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      chunk_id: string;
      text_hash: string;
      source_text_hash: string;
    }>(
      `
        SELECT chunk_id, text_hash, source_text_hash
        FROM document_chunks
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_id = $3
          AND chunk_kind = 'child'
          AND stale = false
        ORDER BY chunk_ordinal ASC
        LIMIT 1
      `,
      [tenantAlphaId, documentId, versionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('AI session fixture child chunk missing');
    return row;
  });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
