import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiSessionDetailDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiSessionLogService } from '../../apps/api/src/modules/ai/session/ai-session-log.service';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
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

describe('AI session log integration', () => {
  const marker = `ai-session-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let adminCookie: string;
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

    const sessions = app.get(AiSessionLogService);
    const context = { tenantId: tenantAlphaId, userId: alphaOwnerUserId };
    const created = await sessions.createSession(context, {
      matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex('prompt hash input only'),
      promptLength: 22,
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
        included: true,
        reasonCode: 'included',
        rankIndex: 1,
        score: 0.7,
        quoteHash: hidden.quoteHash,
        sourceTextHash: hidden.sourceTextHash,
      },
    ]);
    await sessions.recordResponse(context, sessionId, {
      responseHash: sha256Hex('response hash input only'),
      responseLength: 48,
      responseTokenCount: 12,
      latencyMs: 42,
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

  it('creates tenant-scoped AI session schema without prompt or response raw text columns', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('ai_sessions', 'ai_session_chunks')
          ORDER BY table_name, ordinal_position
        `,
      );
      const names = columns.rows.map((row) => `${row.table_name}.${row.column_name}`);
      expect(names).toContain('ai_sessions.tenant_id');
      expect(names).toContain('ai_session_chunks.tenant_id');
      expect(names.join('\n')).not.toMatch(/prompt_text|response_text|body|content|snippet|raw/i);

      const rls = await client.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `
          SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
          WHERE relname IN ('ai_sessions', 'ai_session_chunks')
          ORDER BY relname
        `,
      );
      expect(rls.rows).toEqual([
        { relname: 'ai_session_chunks', relrowsecurity: true, relforcerowsecurity: true },
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

  it('lets authorized admins view session metadata while rechecking source permission', async () => {
    const detail = await getSessionDetail(adminCookie, sessionId, 200);

    expect(detail.sessionId).toBe(sessionId);
    expect(detail.ownerUserId).toBe(alphaOwnerUserId);
    expect(detail.chunks).toEqual([]);
    expect(detail.hiddenSourceCount).toBe(2);
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
  ): Promise<AiSessionDetailDto> {
    const response = await fetch(`${baseUrl}/v1/ai/sessions/${id}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(expectedStatus);
    return JSON.parse(text) as AiSessionDetailDto;
  }
});

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
