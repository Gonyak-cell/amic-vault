import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { ExtractionDispatcher } from '../../../apps/api/src/modules/document/extraction/extraction-dispatcher';
import { IndexingProcessor } from '../../../apps/api/src/modules/search/index/indexing.processor';
import { searchIndexQueueName } from '../../../apps/api/src/modules/search/index/indexing.service';
import {
  deterministicEmbeddingVector,
  vectorToSqlLiteral,
} from '../../../apps/api/src/modules/search/semantic/local-embedding';
import { NoopEncryptionHook } from '../../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../../apps/api/src/modules/storage/storage.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';
import {
  alphaOwnerUserId,
  betaOwnerUserId,
  createClient,
  loginBetaOwner,
  uploadPdf,
} from '../document-access/document-api-helpers';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';

interface CurrentVersionRow {
  version_id: string;
  storage_uri: string;
}

interface SearchJobRow {
  data: { tenantId: string; documentId: string; versionId: string };
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  dead_letter: string;
  singleton_key: string;
}

interface EmbeddingRow {
  dimensions: number;
  model_route: string;
  stale: boolean;
}

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createMatterForTenant(
  baseUrl: string,
  cookie: string,
  input: { clientId: string; marker: string; leadLawyerId: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      matterCode: `${input.marker}-${randomUUID()}`,
      matterName: `${input.marker} Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: input.leadLawyerId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function currentVersion(tenantId: string, documentId: string): Promise<CurrentVersionRow> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<CurrentVersionRow>(
      `
        SELECT dv.version_id, f.storage_uri
        FROM document_versions dv
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_status = 'current'
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as CurrentVersionRow;
  });
}

async function ensureFreshMatterAppSyncState(tenantId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO matter_app_sync_state (
          tenant_id,
          source_ref,
          last_sync_at,
          reflected_count,
          drift_count,
          source_revision_hash,
          source_artifact_hash,
          run_id_hash,
          status,
          summary_json
        )
        VALUES (
          $1,
          'lawos_lazycodex_canonical_identity',
          now(),
          1,
          0,
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          'pass',
          '{"fixture":"search_index"}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref)
        DO UPDATE SET
          last_sync_at = EXCLUDED.last_sync_at,
          reflected_count = EXCLUDED.reflected_count,
          drift_count = EXCLUDED.drift_count,
          source_revision_hash = EXCLUDED.source_revision_hash,
          source_artifact_hash = EXCLUDED.source_artifact_hash,
          run_id_hash = EXCLUDED.run_id_hash,
          status = EXCLUDED.status,
          summary_json = EXCLUDED.summary_json,
          updated_at = now()
      `,
      [tenantId],
    );
  });
}

async function searchJob(versionId: string): Promise<SearchJobRow> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<SearchJobRow>(
      `
        SELECT data, retry_limit, retry_delay, retry_backoff, dead_letter, singleton_key
        FROM pgboss.job
        WHERE name = $1
          AND data->>'versionId' = $2
        ORDER BY created_on DESC
        LIMIT 1
      `,
      [searchIndexQueueName, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as SearchJobRow;
  });
}

async function indexRow(tenantId: string, versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      title: string;
      content_text: string;
      document_status: string;
      version_status: string;
      source_text_hash: string;
    }>(
      `
        SELECT title, content_text, document_status, version_status, source_text_hash
        FROM document_search_index
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [tenantId, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0];
  });
}

async function embeddingRow(tenantId: string, versionId: string): Promise<EmbeddingRow> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<EmbeddingRow>(
      `
        SELECT model_route, stale, vector_dims(embedding)::int AS dimensions
        FROM document_chunk_embeddings
        WHERE tenant_id = $1
          AND version_id = $2
          AND model_route = 'bge_m3'
        ORDER BY stale ASC, updated_at DESC
        LIMIT 1
      `,
      [tenantId, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as EmbeddingRow;
  });
}

async function seedLegacyEmbeddingRow(tenantId: string, versionId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    const vector = vectorToSqlLiteral(deterministicEmbeddingVector('legacy embedding seed'));
    await client.query(
      `
        UPDATE document_chunk_embeddings
        SET stale = true,
          updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
          AND model_route = 'bge_m3'
      `,
      [tenantId, versionId],
    );
    await client.query(
      `
        INSERT INTO document_chunk_embeddings (
          tenant_id, chunk_id, document_id, version_id, model_route, model_tier,
          embedding, embedding_hash, source_text_hash, stale, updated_at
        )
        SELECT tenant_id, chunk_id, document_id, version_id, 'local_gemma', 'local',
          $3::vector, repeat('1', 64), source_text_hash, false, now()
        FROM document_chunks
        WHERE tenant_id = $1
          AND version_id = $2
          AND chunk_kind = 'child'
        ORDER BY chunk_ordinal ASC
        LIMIT 1
        ON CONFLICT (tenant_id, chunk_id, model_route)
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          embedding_hash = EXCLUDED.embedding_hash,
          stale = false,
          updated_at = EXCLUDED.updated_at
      `,
      [tenantId, versionId, vector],
    );
  });
}

async function legacyEmbeddingCount(tenantId: string, versionId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_chunk_embeddings
        WHERE tenant_id = $1
          AND version_id = $2
          AND model_route <> 'bge_m3'
      `,
      [tenantId, versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function hnswPlanUsesBgeM3Index(): Promise<boolean> {
  return withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL enable_seqscan = off');
      const vector = vectorToSqlLiteral(deterministicEmbeddingVector('termination governing law'));
      const result = await client.query<{ 'QUERY PLAN': string }>(
        `
          EXPLAIN (COSTS OFF)
          SELECT embedding_id
          FROM document_chunk_embeddings
          WHERE model_route = 'bge_m3'
            AND stale = false
          ORDER BY embedding <=> $1::vector
          LIMIT 1
        `,
        [vector],
      );
      return result.rows.some((row) =>
        row['QUERY PLAN'].includes('idx_document_chunk_embeddings_bge_m3_hnsw'),
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });
}

async function indexCountVisibleFromTenant(
  visibleTenantId: string,
  versionId: string,
): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, visibleTenantId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_search_index
        WHERE version_id = $1
      `,
      [versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

function startMockWorker(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'ready',
        extraction_method: 'pdf_text',
        body_text: 'Search index extracted body about termination and governing law',
        confidence: 1,
        failure_reason_code: null,
      }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function startMockEmbeddingServer(): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/embed') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input?: unknown };
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        model: 'bge-m3',
        embeddings: inputs.map((input) => deterministicEmbeddingVector(String(input ?? ''))),
        total_duration: 10_000_000,
        load_duration: 1_000_000,
        prompt_eval_count: inputs.length,
      }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('search-index integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mockWorker: Awaited<ReturnType<typeof startMockWorker>>;
  let mockEmbeddingServer: Awaited<ReturnType<typeof startMockEmbeddingServer>>;
  let previousWorkerUrl: string | undefined;
  let previousExtractionWorkerEnabled: string | undefined;
  let previousSearchWorkerEnabled: string | undefined;
  let previousLocalEmbeddingEndpoint: string | undefined;
  let previousLocalEmbeddingModel: string | undefined;
  const storageUris: Array<{ tenantId: string; storageUri: string }> = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousExtractionWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    previousSearchWorkerEnabled = process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    previousLocalEmbeddingEndpoint = process.env.LOCAL_EMBEDDING_ENDPOINT;
    previousLocalEmbeddingModel = process.env.LOCAL_EMBEDDING_MODEL;
    mockWorker = await startMockWorker();
    mockEmbeddingServer = await startMockEmbeddingServer();
    process.env.INGESTION_WORKER_URL = mockWorker.url;
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = '0';
    process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = '0';
    process.env.LOCAL_EMBEDDING_ENDPOINT = mockEmbeddingServer.url;
    process.env.LOCAL_EMBEDDING_MODEL = 'bge-m3';

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const item of storageUris) {
      await storage.deleteByStorageUri(item.tenantId, item.storageUri);
    }
    await app.close();
    await new Promise<void>((resolve) => mockWorker.server.close(() => resolve()));
    await new Promise<void>((resolve) => mockEmbeddingServer.server.close(() => resolve()));
    if (previousWorkerUrl === undefined) delete process.env.INGESTION_WORKER_URL;
    else process.env.INGESTION_WORKER_URL = previousWorkerUrl;
    if (previousExtractionWorkerEnabled === undefined) delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    else process.env.EXTRACTION_QUEUE_WORKER_ENABLED = previousExtractionWorkerEnabled;
    if (previousSearchWorkerEnabled === undefined) delete process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    else process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = previousSearchWorkerEnabled;
    if (previousLocalEmbeddingEndpoint === undefined) delete process.env.LOCAL_EMBEDDING_ENDPOINT;
    else process.env.LOCAL_EMBEDDING_ENDPOINT = previousLocalEmbeddingEndpoint;
    if (previousLocalEmbeddingModel === undefined) delete process.env.LOCAL_EMBEDDING_MODEL;
    else process.env.LOCAL_EMBEDDING_MODEL = previousLocalEmbeddingModel;
  });

  it('indexes extracted text, stays tenant isolated, and syncs metadata/status updates', async () => {
    const cookie = await loginBetaOwner(baseUrl);
    const clientId = await createClient(baseUrl, cookie, 'Search Index');
    const matterId = await createMatterForTenant(baseUrl, cookie, {
      clientId,
      marker: 'SEARCH-IDX',
      leadLawyerId: betaOwnerUserId,
    });
    await ensureFreshMatterAppSyncState(tenantBetaId);
    const uploaded = await uploadPdf(baseUrl, cookie, matterId, 'search-index');
    const version = await currentVersion(tenantBetaId, uploaded.documentId);
    storageUris.push({ tenantId: tenantBetaId, storageUri: version.storage_uri });

    await app.get(ExtractionDispatcher).handle({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
      fileObjectId: uploaded.fileObjectId,
    });

    const job = await searchJob(version.version_id);
    expect(job).toMatchObject({
      retry_limit: 5,
      retry_delay: 1,
      retry_backoff: true,
      dead_letter: 'search.index.dead',
      singleton_key: version.version_id,
    });
    expect(JSON.stringify(job.data)).not.toContain('Search index extracted body');

    await app.get(IndexingProcessor).handle(job.data);
    await expect(indexRow(tenantBetaId, version.version_id)).resolves.toMatchObject({
      content_text: 'Search index extracted body about termination and governing law',
      document_status: 'draft',
      version_status: 'current',
    });
    await expect(embeddingRow(tenantBetaId, version.version_id)).resolves.toMatchObject({
      dimensions: 1024,
      model_route: 'bge_m3',
      stale: false,
    });
    await expect(hnswPlanUsesBgeM3Index()).resolves.toBe(true);
    await expect(indexCountVisibleFromTenant(tenantAlphaId, version.version_id)).resolves.toBe(0);

    const startedAt = performance.now();
    const metadata = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Search Index Title' }),
    });
    const metadataBody = await metadata.text();
    expect(metadata.status, metadataBody).toBe(200);
    await app.get(IndexingProcessor).handle((await searchJob(version.version_id)).data);
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeLessThan(60_000);
    await expect(indexRow(tenantBetaId, version.version_id)).resolves.toMatchObject({
      title: 'Updated Search Index Title',
      document_status: 'draft',
    });

    const deleted = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    const deletedBody = await deleted.text();
    expect(deleted.status, deletedBody).toBe(204);
    await app.get(IndexingProcessor).handle((await searchJob(version.version_id)).data);
    await expect(indexRow(tenantBetaId, version.version_id)).resolves.toMatchObject({
      document_status: 'deleted',
    });
  });

  it('allows admin reindex with audit and blocks non-admins', async () => {
    const adminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    const ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    const clientId = await createClient(baseUrl, adminCookie, 'Search Reindex');
    const matterId = await createMatterForTenant(baseUrl, ownerCookie, {
      clientId,
      marker: 'SEARCH-REINDEX',
      leadLawyerId: alphaOwnerUserId,
    });
    await ensureFreshMatterAppSyncState(tenantAlphaId);
    const uploaded = await uploadPdf(baseUrl, ownerCookie, matterId, 'search-reindex');
    const version = await currentVersion(tenantAlphaId, uploaded.documentId);
    storageUris.push({ tenantId: tenantAlphaId, storageUri: version.storage_uri });

    const denied = await fetch(`${baseUrl}/v1/admin/search/reindex`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: 'matter', scopeId: matterId }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');

    const deniedHealth = await fetch(`${baseUrl}/v1/admin/search/health`, {
      headers: { cookie: ownerCookie },
    });
    const deniedHealthBody = await deniedHealth.text();
    expect(deniedHealth.status, deniedHealthBody).toBe(403);
    expect(deniedHealthBody).toContain('PERMISSION_DENIED');

    const accepted = await fetch(`${baseUrl}/v1/admin/search/reindex`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: 'matter', scopeId: matterId }),
    });
    const acceptedBody = await accepted.text();
    expect(accepted.status, acceptedBody).toBe(201);
    expect(JSON.parse(acceptedBody)).toMatchObject({
      accepted: true,
      scopeType: 'matter',
      scopeId: matterId,
      enqueuedJobCount: 1,
    });

    await withClient(createOwnerClient(), async (client) => {
      const audit = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'SEARCH_REINDEX_REQUESTED'
            AND actor_id = $2
            AND metadata_json->>'scope_type' = 'matter'
            AND metadata_json->>'scope_id' = $3
            AND metadata_json->>'enqueued_job_count' = '1'
            AND NOT (metadata_json ? 'body')
            AND NOT (metadata_json ? 'content')
            AND NOT (metadata_json ? 'snippet')
        `,
        [tenantAlphaId, alphaFirmAdminUserId, matterId],
      );
      expect(Number(audit.rows[0]?.count ?? '0')).toBeGreaterThanOrEqual(1);
    });

    const noResultSearch = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'synthetic-no-result-health-check', target: 'body' }),
    });
    const noResultSearchBody = await noResultSearch.text();
    expect(noResultSearch.status, noResultSearchBody).toBe(201);

    const health = await fetch(`${baseUrl}/v1/admin/search/health`, {
      headers: { cookie: adminCookie },
    });
    const healthBody = await health.text();
    expect(health.status, healthBody).toBe(200);
    const parsed = JSON.parse(healthBody) as {
      currentVersionCount: number;
      missingIndexCount: number;
      noResultQueryCount24h: number;
      noResultQueries: Array<{ queryHash: string; count: number; category: string }>;
    };
    expect(parsed.currentVersionCount).toBeGreaterThanOrEqual(1);
    expect(parsed.missingIndexCount).toBeGreaterThanOrEqual(1);
    expect(parsed.noResultQueryCount24h).toBeGreaterThanOrEqual(1);
    expect(parsed.noResultQueries[0]?.queryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.noResultQueries[0]?.count).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(parsed)).not.toMatch(
      /synthetic-no-result-health-check|body_text|content_text|snippet|raw|prompt|response/i,
    );
  });

  it('backfills stale and legacy embeddings through the admin API and cleans old routes', async () => {
    const adminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    const ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    const clientId = await createClient(baseUrl, adminCookie, 'Search Backfill');
    const matterId = await createMatterForTenant(baseUrl, ownerCookie, {
      clientId,
      marker: 'SEARCH-BACKFILL',
      leadLawyerId: alphaOwnerUserId,
    });
    await ensureFreshMatterAppSyncState(tenantAlphaId);
    const uploaded = await uploadPdf(baseUrl, ownerCookie, matterId, 'search-backfill');
    const version = await currentVersion(tenantAlphaId, uploaded.documentId);
    storageUris.push({ tenantId: tenantAlphaId, storageUri: version.storage_uri });

    await app.get(ExtractionDispatcher).handle({
      tenantId: tenantAlphaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
      fileObjectId: uploaded.fileObjectId,
    });
    await app.get(IndexingProcessor).handle((await searchJob(version.version_id)).data);
    await seedLegacyEmbeddingRow(tenantAlphaId, version.version_id);
    await expect(embeddingRow(tenantAlphaId, version.version_id)).resolves.toMatchObject({
      model_route: 'bge_m3',
      stale: true,
    });
    await expect(legacyEmbeddingCount(tenantAlphaId, version.version_id)).resolves.toBeGreaterThan(0);

    const progressBefore = await fetch(`${baseUrl}/v1/admin/search/embeddings/backfill/progress`, {
      headers: { cookie: adminCookie },
    });
    const progressBeforeBody = await progressBefore.text();
    expect(progressBefore.status, progressBeforeBody).toBe(200);
    expect(JSON.parse(progressBeforeBody)).toMatchObject({
      staleEmbeddingCount: expect.any(Number),
      legacyEmbeddingCount: expect.any(Number),
      deadLetterJobCount: expect.any(Number),
    });

    const accepted = await fetch(`${baseUrl}/v1/admin/search/embeddings/backfill`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: 'matter', scopeId: matterId, batchSize: 5 }),
    });
    const acceptedBody = await accepted.text();
    expect(accepted.status, acceptedBody).toBe(201);
    expect(JSON.parse(acceptedBody)).toMatchObject({
      accepted: true,
      scopeType: 'matter',
      scopeId: matterId,
      batchSize: 5,
      candidateVersionCount: 1,
      enqueuedJobCount: 1,
    });
    const job = await searchJob(version.version_id);
    expect(job).toMatchObject({
      retry_limit: 5,
      retry_delay: 1,
      retry_backoff: true,
      dead_letter: 'search.index.dead',
      singleton_key: version.version_id,
    });

    await app.get(IndexingProcessor).handle(job.data);

    await expect(embeddingRow(tenantAlphaId, version.version_id)).resolves.toMatchObject({
      dimensions: 1024,
      model_route: 'bge_m3',
      stale: false,
    });
    await expect(legacyEmbeddingCount(tenantAlphaId, version.version_id)).resolves.toBe(0);

    await withClient(createOwnerClient(), async (client) => {
      const audit = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'SEARCH_REINDEX_REQUESTED'
            AND actor_id = $2
            AND metadata_json->>'scope_type' = 'embedding_backfill_matter'
            AND metadata_json->>'scope_id' = $3
            AND metadata_json->>'batch_size' = '5'
            AND metadata_json->>'enqueued_job_count' = '1'
            AND metadata_json->>'queue_name' = 'search.index'
            AND metadata_json->>'dead_letter_queue' = 'search.index.dead'
            AND NOT (metadata_json ? 'body')
            AND NOT (metadata_json ? 'content')
            AND NOT (metadata_json ? 'snippet')
        `,
        [tenantAlphaId, alphaFirmAdminUserId, matterId],
      );
      expect(Number(audit.rows[0]?.count ?? '0')).toBeGreaterThanOrEqual(1);
    });
  }, 20_000);
});
