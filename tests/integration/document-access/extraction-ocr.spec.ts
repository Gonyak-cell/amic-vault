import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { ExtractionDispatcher } from '../../../apps/api/src/modules/document/extraction/extraction-dispatcher';
import {
  extractionQueueName,
  ocrQueueName,
} from '../../../apps/api/src/modules/document/extraction/extraction.types';
import { IndexingProcessor } from '../../../apps/api/src/modules/search/index/indexing.processor';
import { searchIndexQueueName } from '../../../apps/api/src/modules/search/index/indexing.service';
import {
  alphaOwnerUserId,
  createClient,
  createMatter,
  createStorageService,
  login,
  loginBetaOwner,
} from './document-api-helpers';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface CurrentVersionRow {
  version_id: string;
  file_object_id: string;
  storage_uri: string;
}

interface ExtractionJobData {
  tenantId: string;
  documentId: string;
  versionId: string;
  fileObjectId: string;
}

interface SearchIndexJobData {
  tenantId: string;
  documentId: string;
  versionId: string;
}

interface PgBossJobRow<TData = ExtractionJobData> {
  data: TData;
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  dead_letter: string;
  singleton_key: string;
}

interface SearchResponse {
  facets: {
    ocrConfidence: Array<{ value: string; count: number }>;
  };
  results: Array<{
    documentId: string;
    extractionStatus?: string | null;
    snippet: string;
    title: string;
  }>;
  total: number;
}

const ocrReadyBodyToken = `B1OCRTOKEN-${randomUUID()}`;
const ocrReadyBodyText = `${ocrReadyBodyToken} 스캔 계약서 OCR 본문 키워드`;
const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';

function blankPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${Array.from(
      { length: pageCount },
      (_item, index) => `${index + 3} 0 R`,
    ).join(' ')}] >>\nendobj\n`,
  );
  for (let index = 0; index < pageCount; index += 1) {
    objects.push(
      `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <<>> >>\nendobj\n`,
    );
  }

  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function scanPdfForm(marker: string): FormData {
  const form = new FormData();
  form.append('title', `${marker} 스캔 계약서`);
  form.append(
    'file',
    new Blob([new Uint8Array(blankPdf(10))], { type: 'application/pdf' }),
    `${marker}.pdf`,
  );
  return form;
}

async function uploadScanPdf(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: scanPdfForm(marker),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function ensureFreshMatterAppSyncState(): Promise<void> {
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
          '{"fixture":"b1_extraction_ocr"}'::jsonb
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
      [tenantBetaId],
    );
  });
}

async function ensureFreshMatterAppSyncStateForTenant(tenantId: string): Promise<void> {
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
          '{"fixture":"d7_ocr_backfill"}'::jsonb
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

async function createMatterForLead(
  baseUrl: string,
  cookie: string,
  input: { clientId: string; leadLawyerId: string; marker: string },
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

async function currentVersion(
  documentId: string,
  tenantId = tenantBetaId,
): Promise<CurrentVersionRow> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<CurrentVersionRow>(
      `
        SELECT dv.version_id, dv.file_object_id, f.storage_uri
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

async function markOcrPending(tenantId: string, versionId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE canonical_documents
        SET extraction_status = 'ocr_pending',
          extraction_method = 'ocr_required',
          body_text = '',
          confidence = 0,
          failure_reason_code = NULL,
          updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
      `,
      [tenantId, versionId],
    );
  });
}

async function queuedJob<TData = ExtractionJobData>(
  queueName: string,
  versionId: string,
): Promise<PgBossJobRow<TData>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<PgBossJobRow>(
      `
        SELECT data, retry_limit, retry_delay, retry_backoff, dead_letter, singleton_key
        FROM pgboss.job
        WHERE name = $1
          AND data->>'versionId' = $2
        ORDER BY created_on DESC
        LIMIT 1
      `,
      [queueName, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as PgBossJobRow<TData>;
  });
}

async function canonicalRow(versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      body_text: string;
      confidence: string;
      extraction_method: string;
      extraction_status: string;
      failure_reason_code: string | null;
    }>(
      `
        SELECT body_text, confidence::text, extraction_method, extraction_status,
          failure_reason_code
        FROM canonical_documents
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [tenantBetaId, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0];
  });
}

async function extractionAuditCounts(versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ extraction_status: string; count: string }>(
      `
        SELECT metadata_json->>'extraction_status' AS extraction_status, count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'DOCUMENT_TEXT_EXTRACTED'
          AND metadata_json->>'version_id' = $2
          AND NOT (metadata_json ? 'body')
          AND NOT (metadata_json ? 'content')
          AND NOT (metadata_json ? 'snippet')
          AND NOT (metadata_json ? 'raw')
        GROUP BY metadata_json->>'extraction_status'
      `,
      [tenantBetaId, versionId],
    );
    return Object.fromEntries(
      result.rows.map((row) => [row.extraction_status, Number(row.count)]),
    ) as Record<string, number>;
  });
}

async function ocrBackfillAuditCount(input: { tenantId: string; actorId: string; matterId: string }) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'SEARCH_REINDEX_REQUESTED'
          AND actor_id = $2
          AND metadata_json->>'scope_type' = 'ocr_backfill_matter'
          AND metadata_json->>'scope_id' = $3
          AND metadata_json->>'enqueued_job_count' = '1'
          AND NOT (metadata_json ? 'body')
          AND NOT (metadata_json ? 'content')
          AND NOT (metadata_json ? 'snippet')
          AND NOT (metadata_json ? 'raw')
      `,
      [input.tenantId, input.actorId, input.matterId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function postSearch(baseUrl: string, cookie: string, body: unknown): Promise<SearchResponse> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(201);
  return JSON.parse(text) as SearchResponse;
}

async function canonicalCountVisibleFromAlpha(versionId: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM canonical_documents
        WHERE version_id = $1
      `,
      [versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

function startMockOcrWorker(): Promise<{
  bodies: Record<'extract' | 'ocr', string[]>;
  server: Server;
  url: string;
}> {
  const bodies: Record<'extract' | 'ocr', string[]> = { extract: [], ocr: [] };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      expect([tenantAlphaId, tenantBetaId]).toContain(request.headers['x-amic-tenant-id']);
      if (request.url === '/extract') {
        bodies.extract.push(body);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ocr_pending',
            extraction_method: 'ocr_required',
            body_text: '',
            confidence: 0,
            failure_reason_code: null,
          }),
        );
        return;
      }
      if (request.url === '/ocr') {
        bodies.ocr.push(body);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ready',
            extraction_method: 'ocr',
            body_text: ocrReadyBodyText,
            confidence: 0.7,
            failure_reason_code: null,
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ bodies, server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('document OCR extraction integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let matterId: string;
  let mockWorker: Awaited<ReturnType<typeof startMockOcrWorker>>;
  let previousWorkerUrl: string | undefined;
  let previousExtractionWorkerEnabled: string | undefined;
  let previousOcrWorkerEnabled: string | undefined;
  let previousLocalEmbeddingEnabled: string | undefined;
  const storageUris: Array<{ tenantId: string; storageUri: string }> = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousExtractionWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    previousOcrWorkerEnabled = process.env.OCR_QUEUE_WORKER_ENABLED;
    previousLocalEmbeddingEnabled = process.env.LOCAL_EMBEDDING_ENABLED;
    mockWorker = await startMockOcrWorker();
    process.env.INGESTION_WORKER_URL = mockWorker.url;
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = '0';
    process.env.OCR_QUEUE_WORKER_ENABLED = '0';
    process.env.LOCAL_EMBEDDING_ENABLED = '0';

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState();
    const marker = `B1-OCR-${randomUUID()}`;
    const clientId = await createClient(baseUrl, cookie, marker);
    matterId = await createMatter(baseUrl, cookie, clientId, marker);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const item of storageUris) {
      await storage.deleteByStorageUri(item.tenantId, item.storageUri);
    }
    await app.close();
    await new Promise<void>((resolve) => mockWorker.server.close(() => resolve()));
    if (previousWorkerUrl === undefined) {
      delete process.env.INGESTION_WORKER_URL;
    } else {
      process.env.INGESTION_WORKER_URL = previousWorkerUrl;
    }
    if (previousExtractionWorkerEnabled === undefined) {
      delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    } else {
      process.env.EXTRACTION_QUEUE_WORKER_ENABLED = previousExtractionWorkerEnabled;
    }
    if (previousOcrWorkerEnabled === undefined) {
      delete process.env.OCR_QUEUE_WORKER_ENABLED;
    } else {
      process.env.OCR_QUEUE_WORKER_ENABLED = previousOcrWorkerEnabled;
    }
    if (previousLocalEmbeddingEnabled === undefined) {
      delete process.env.LOCAL_EMBEDDING_ENABLED;
    } else {
      process.env.LOCAL_EMBEDDING_ENABLED = previousLocalEmbeddingEnabled;
    }
  });

  it('moves a scanned PDF from ocr_pending to ready OCR text and indexes it for body search', async () => {
    const startedAt = Date.now();
    const marker = `B1-OCR-${randomUUID()}`;
    const uploaded = await uploadScanPdf(baseUrl, cookie, matterId, marker);
    const version = await currentVersion(uploaded.documentId);
    storageUris.push({ tenantId: tenantBetaId, storageUri: version.storage_uri });

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'pending',
      extraction_method: 'pending',
      confidence: '0.000',
      body_text: '',
      failure_reason_code: null,
    });

    const extractJob = await queuedJob(extractionQueueName, version.version_id);
    expect(extractJob.data).toEqual({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
      fileObjectId: uploaded.fileObjectId,
    });
    expect(JSON.stringify(extractJob.data)).not.toContain(marker);

    await app.get(ExtractionDispatcher).handle(extractJob.data);
    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ocr_pending',
      extraction_method: 'ocr_required',
      confidence: '0.000',
      body_text: '',
      failure_reason_code: null,
    });

    const ocrJob = await queuedJob(ocrQueueName, version.version_id);
    expect(ocrJob.data).toEqual(extractJob.data);
    expect(ocrJob).toMatchObject({
      retry_limit: 3,
      retry_delay: 5,
      retry_backoff: true,
      dead_letter: 'ingestion.ocr.dead',
      singleton_key: version.version_id,
    });
    expect(JSON.stringify(ocrJob.data)).not.toContain(ocrReadyBodyText);

    await app.get(ExtractionDispatcher).handleOcr(ocrJob.data);
    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ready',
      extraction_method: 'ocr',
      confidence: '0.700',
      body_text: ocrReadyBodyText,
      failure_reason_code: null,
    });
    await expect(extractionAuditCounts(version.version_id)).resolves.toMatchObject({
      ocr_pending: 1,
      ready: 1,
    });
    await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);

    const searchJob = await queuedJob<SearchIndexJobData>(searchIndexQueueName, version.version_id);
    expect(searchJob.data).toEqual({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
    });
    expect(searchJob).toMatchObject({
      retry_limit: 5,
      retry_delay: 1,
      retry_backoff: true,
      dead_letter: 'search.index.dead',
      singleton_key: version.version_id,
    });
    expect(JSON.stringify(searchJob.data)).not.toContain(ocrReadyBodyText);

    await app.get(IndexingProcessor).handle(searchJob.data);
    const search = await postSearch(baseUrl, cookie, {
      query: ocrReadyBodyToken,
      target: 'body',
      filters: { ocrConfidence: 'ocr_low_confidence' },
      pageSize: 10,
    });
    expect(search.total).toBe(1);
    expect(search.results[0]).toMatchObject({
      documentId: uploaded.documentId,
      extractionStatus: 'ready',
      title: `${marker} 스캔 계약서`,
    });
    expect(search.results[0]?.snippet).toContain(ocrReadyBodyToken);
    expect(search.facets.ocrConfidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'ocr_low_confidence', count: 1 }),
      ]),
    );

    expect(mockWorker.bodies.extract).toHaveLength(1);
    expect(mockWorker.bodies.ocr).toHaveLength(1);
    expect(mockWorker.bodies.extract.join('\n')).not.toContain(ocrReadyBodyText);
    expect(Date.now() - startedAt).toBeLessThan(5 * 60 * 1000);
  });

  it('lets admins backfill residual ocr_pending documents and blocks non-admins', async () => {
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
    const marker = `D7-OCR-BACKFILL-${randomUUID()}`;
    await ensureFreshMatterAppSyncStateForTenant(tenantAlphaId);
    const clientId = await createClient(baseUrl, adminCookie, marker);
    const alphaMatterId = await createMatterForLead(baseUrl, ownerCookie, {
      clientId,
      leadLawyerId: alphaOwnerUserId,
      marker,
    });
    const uploaded = await uploadScanPdf(baseUrl, ownerCookie, alphaMatterId, marker);
    const version = await currentVersion(uploaded.documentId, tenantAlphaId);
    storageUris.push({ tenantId: tenantAlphaId, storageUri: version.storage_uri });
    await markOcrPending(tenantAlphaId, version.version_id);

    const denied = await fetch(`${baseUrl}/v1/admin/documents/ocr-backfill`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: 'matter', scopeId: alphaMatterId }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');

    const accepted = await fetch(`${baseUrl}/v1/admin/documents/ocr-backfill`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: 'matter', scopeId: alphaMatterId }),
    });
    const acceptedBody = await accepted.text();
    expect(accepted.status, acceptedBody).toBe(201);
    expect(JSON.parse(acceptedBody)).toMatchObject({
      accepted: true,
      scopeType: 'matter',
      scopeId: alphaMatterId,
      enqueuedJobCount: 1,
    });

    const ocrJob = await queuedJob(ocrQueueName, version.version_id);
    expect(ocrJob.data).toEqual({
      tenantId: tenantAlphaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
      fileObjectId: version.file_object_id,
    });
    expect(ocrJob).toMatchObject({
      retry_limit: 3,
      retry_delay: 5,
      retry_backoff: true,
      dead_letter: 'ingestion.ocr.dead',
      singleton_key: version.version_id,
    });
    await expect(
      ocrBackfillAuditCount({
        tenantId: tenantAlphaId,
        actorId: alphaFirmAdminUserId,
        matterId: alphaMatterId,
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
