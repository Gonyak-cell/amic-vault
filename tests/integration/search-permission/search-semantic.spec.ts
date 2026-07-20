import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  semanticTestEmbeddingVector,
  setDocumentAiAllowed,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

interface SemanticRef {
  documentId: string;
  versionId: string;
  matterId: string;
  title: string;
  contentText: string;
}

describe('semantic search permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let clientId: string;
  let visible: SemanticRef;
  let aiDenied: SemanticRef;
  let nonMember: SemanticRef;
  let explicitDenied: SemanticRef;
  let wallDenied: SemanticRef;
  let synonymClientId: string;
  let synonymVisible: SemanticRef;
  let synonymHidden: SemanticRef;
  let embeddingServer: Server;
  let previousEmbeddingEndpoint: string | undefined;
  let previousEmbeddingEnabled: string | undefined;
  let previousEmbeddingModel: string | undefined;

  beforeAll(async () => {
    previousEmbeddingEndpoint = process.env.LOCAL_EMBEDDING_ENDPOINT;
    previousEmbeddingEnabled = process.env.LOCAL_EMBEDDING_ENABLED;
    previousEmbeddingModel = process.env.LOCAL_EMBEDDING_MODEL;
    const embeddingEndpoint = await startEmbeddingEndpoint();
    embeddingServer = embeddingEndpoint.server;
    process.env.LOCAL_EMBEDDING_ENDPOINT = embeddingEndpoint.url;
    process.env.LOCAL_EMBEDDING_ENABLED = '1';
    process.env.LOCAL_EMBEDDING_MODEL = 'bge-m3';

    clientId = randomUUID();
    visible = await insertSemanticRow({
      clientId,
      title: 'Semantic Visible Agreement',
      contentText: 'semanticvaultalpha allowed local vector context termination covenant',
      aiAllowed: true,
      index: 801,
    });
    aiDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic AI Disabled Memo',
      contentText: 'semanticvaultalpha ai disabled document context',
      aiAllowed: false,
      index: 802,
    });
    nonMember = await insertSemanticRow({
      clientId,
      title: 'Semantic Nonmember Hidden',
      contentText: 'semanticvaultalpha nonmember hidden context',
      aiAllowed: true,
      index: 803,
    });
    explicitDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic Explicit Deny Hidden',
      contentText: 'semanticvaultalpha explicit deny hidden context',
      aiAllowed: true,
      index: 804,
    });
    wallDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic Wall Hidden',
      contentText: 'semanticvaultalpha wall hidden context',
      aiAllowed: true,
      index: 805,
    });
    synonymClientId = randomUUID();
    synonymVisible = await insertSemanticRow({
      clientId: synonymClientId,
      title: '계약의 종료 검토',
      contentText: '계약의 종료 조항과 정산 절차를 검토한 문서',
      aiAllowed: true,
      index: 806,
    });
    synonymHidden = await insertSemanticRow({
      clientId: synonymClientId,
      title: '계약의 종료 숨김 전략',
      contentText: '계약의 종료 내부 전략과 위험 분석',
      aiAllowed: true,
      index: 807,
    });

    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: visible.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: synonymVisible.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: aiDenied.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: explicitDenied.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: explicitDenied.documentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallDenied.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallDenied.matterId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await closeServer(embeddingServer);
    restoreEnv('LOCAL_EMBEDDING_ENDPOINT', previousEmbeddingEndpoint);
    restoreEnv('LOCAL_EMBEDDING_ENABLED', previousEmbeddingEnabled);
    restoreEnv('LOCAL_EMBEDDING_MODEL', previousEmbeddingModel);
  });

  it('returns only permission-scoped chunks for semantic search', async () => {
    const response = await postSearch(baseUrl, cookie, {
      mode: 'semantic',
      query: 'semanticvaultalpha hidden context',
      filters: { clientId },
      page: 1,
      pageSize: 10,
    });

    expect(response.total).toBe(2);
    expect(resultTitles(response)).toEqual(expect.arrayContaining([visible.title, aiDenied.title]));
    expect(response.facets.clients).toEqual([
      {
        value: clientId,
        label: `${visible.title} Client`,
        count: 2,
        canViewSensitiveRef: false,
      },
    ]);
    expectNoPermissionDeniedReferences(response);
  }, 10_000);

  it('uses the same scoped candidate set for hybrid search and reference-only audit', async () => {
    const response = await postSearch(baseUrl, cookie, {
      mode: 'hybrid',
      query: 'semanticvaultalpha termination',
      filters: { clientId },
      page: 1,
      pageSize: 10,
    });

    expect(resultTitles(response)).toEqual(expect.arrayContaining([visible.title, aiDenied.title]));
    expectNoPermissionDeniedReferences(response);

    const audit = await latestHybridSearchAudit();
    expect(audit).toMatchObject({
      scope_type: 'hybrid',
      search_mode: 'hybrid',
      query_length: 'semanticvaultalpha termination'.length,
      result_count: 2,
      zero_result: false,
    });
    expect(JSON.stringify(audit)).not.toContain('semanticvaultalpha termination');
  }, 10_000);

  it('uses local bge-m3 embeddings for Korean synonym hybrid search without leaking unauthorized chunks', async () => {
    const response = await postSearch(baseUrl, cookie, {
      mode: 'hybrid',
      query: '계약 해지',
      filters: { clientId: synonymClientId },
      page: 1,
      pageSize: 10,
    });

    expect(response.total).toBe(1);
    expect(resultTitles(response)).toEqual([synonymVisible.title]);
    const raw = JSON.stringify(response);
    expect(raw).toContain('계약의 종료');
    expect(raw).not.toContain(synonymHidden.title);
    expect(raw).not.toContain(synonymHidden.documentId);
    expect(raw).not.toContain(synonymHidden.versionId);
  }, 10_000);

  it('keeps chunk and embedding rows tenant-scoped under RLS', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query(
        `
          SELECT count(*)::int AS count
          FROM document_chunks
          WHERE version_id = $1
        `,
        [visible.versionId],
      );
      expect(result.rows[0]?.count).toBe(0);
    });
  });

  function expectNoPermissionDeniedReferences(response: unknown): void {
    const raw = JSON.stringify(response);
    for (const denied of [nonMember, explicitDenied, wallDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
    }
  }
});

async function insertSemanticRow(input: {
  clientId: string;
  title: string;
  contentText: string;
  aiAllowed: boolean;
  index: number;
}): Promise<SemanticRef> {
  const row: SemanticRef = {
    documentId: randomUUID(),
    versionId: randomUUID(),
    matterId: randomUUID(),
    title: input.title,
    contentText: input.contentText,
  };
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: row.matterId,
      documentId: row.documentId,
      versionId: row.versionId,
      title: row.title,
      contentText: row.contentText,
      seedChunks: false,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
    input.index,
  );
  await setDocumentAiAllowed({
    tenantId: tenantAlphaId,
    documentId: row.documentId,
    aiAllowed: input.aiAllowed,
  });
  await seedSemanticChunksForVersion({
    tenantId: tenantAlphaId,
    documentId: row.documentId,
    versionId: row.versionId,
    contentText: row.contentText,
  });
  return row;
}

async function latestHybridSearchAudit(): Promise<Record<string, unknown>> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'SEARCH_EXECUTED'
          AND metadata_json->>'scope_type' = 'hybrid'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId],
    );
    return result.rows[0]?.metadata_json as Record<string, unknown>;
  });
}

async function startEmbeddingEndpoint(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/embed') {
      response.writeHead(404).end();
      return;
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      const texts = embeddingInputTexts(raw);
      if (!texts) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid input' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          embeddings: texts.map(semanticTestEmbeddingVector),
          model: 'bge-m3',
          total_duration: 1_000_000,
        }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('embedding endpoint missing port');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function embeddingInputTexts(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as { input?: unknown };
    if (!Array.isArray(parsed.input)) return null;
    const texts = parsed.input.filter((value): value is string => typeof value === 'string');
    return texts.length === parsed.input.length ? texts : null;
  } catch {
    return null;
  }
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
