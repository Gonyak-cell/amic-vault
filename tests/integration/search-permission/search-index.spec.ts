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
  let previousWorkerUrl: string | undefined;
  let previousExtractionWorkerEnabled: string | undefined;
  let previousSearchWorkerEnabled: string | undefined;
  const storageUris: Array<{ tenantId: string; storageUri: string }> = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousExtractionWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    previousSearchWorkerEnabled = process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    mockWorker = await startMockWorker();
    process.env.INGESTION_WORKER_URL = mockWorker.url;
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = '0';
    process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = '0';

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
    if (previousWorkerUrl === undefined) delete process.env.INGESTION_WORKER_URL;
    else process.env.INGESTION_WORKER_URL = previousWorkerUrl;
    if (previousExtractionWorkerEnabled === undefined) delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    else process.env.EXTRACTION_QUEUE_WORKER_ENABLED = previousExtractionWorkerEnabled;
    if (previousSearchWorkerEnabled === undefined) delete process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    else process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = previousSearchWorkerEnabled;
  });

  it('indexes extracted text, stays tenant isolated, and syncs metadata/status updates', async () => {
    const cookie = await loginBetaOwner(baseUrl);
    const clientId = await createClient(baseUrl, cookie, 'Search Index');
    const matterId = await createMatterForTenant(baseUrl, cookie, {
      clientId,
      marker: 'SEARCH-IDX',
      leadLawyerId: betaOwnerUserId,
    });
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
});
