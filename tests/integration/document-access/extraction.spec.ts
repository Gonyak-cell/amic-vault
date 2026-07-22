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
import { extractionQueueName } from '../../../apps/api/src/modules/document/extraction/extraction.types';
import { IndexingProcessor } from '../../../apps/api/src/modules/search/index/indexing.processor';
import { searchIndexQueueName } from '../../../apps/api/src/modules/search/index/indexing.service';
import { NoopEncryptionHook } from '../../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../../apps/api/src/modules/storage/storage.service';
import { markPromotedFixture } from './document-api-helpers';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface CurrentVersionRow {
  version_id: string;
  file_object_id: string;
  storage_uri: string;
}

interface PgBossJobRow {
  data: {
    tenantId: string;
    documentId: string;
    versionId: string;
    fileObjectId: string;
  };
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  dead_letter: string;
  singleton_key: string;
}

const xlsxUploadBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml xl/workbook.xml application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'latin1',
);
const docxUploadBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml word/document.xml application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'latin1',
);
const pptxUploadBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml ppt/presentation.xml application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'latin1',
);
const legacyDocBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-doc', 'latin1');
const legacyXlsBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-xls', 'latin1');
const legacyPptBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-ppt', 'latin1');
const hwp5Bytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-hwp', 'latin1');

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Extraction Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `EXT-${randomUUID()}`,
      matterName: `Extraction Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
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
          '{"fixture":"b2_extraction"}'::jsonb
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

function uploadForm(
  filename: string,
  bytes: Uint8Array,
  contentType = 'application/pdf',
): FormData {
  const form = new FormData();
  form.append('title', `Extraction Draft ${randomUUID()}`);
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  form.append('file', new Blob([payload.buffer], { type: contentType }), filename);
  return form;
}

async function uploadDocument(
  baseUrl: string,
  cookie: string,
  matterId: string,
  input: {
    filename: string;
    bytes: Uint8Array;
    contentType: string;
  } = {
    filename: 'Extraction.pdf',
    bytes: Buffer.from('%PDF-1.7\nEXTRACTION-FIXTURE\n'),
    contentType: 'application/pdf',
  },
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm(input.filename, input.bytes, input.contentType),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const uploaded = JSON.parse(body) as UploadResponse;
  await markPromotedFixture({ documentId: uploaded.documentId });
  return uploaded;
}

async function currentVersion(documentId: string): Promise<CurrentVersionRow> {
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
      [tenantBetaId, documentId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as CurrentVersionRow;
  });
}

async function extractionJob(versionId: string): Promise<PgBossJobRow> {
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
      [extractionQueueName, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as PgBossJobRow;
  });
}

async function searchIndexJob(versionId: string): Promise<PgBossJobRow> {
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
      [searchIndexQueueName, versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as PgBossJobRow;
  });
}

async function searchDocumentIds(baseUrl: string, cookie: string, query: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 10 }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { results: Array<{ documentId: string }> }).results.map(
    (result) => result.documentId,
  );
}

async function canonicalRow(versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      extraction_status: string;
      extraction_method: string;
      confidence: string;
      body_text: string;
      failure_reason_code: string | null;
    }>(
      `
        SELECT extraction_status, extraction_method, confidence::text, body_text,
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

async function extractionAuditCount(versionId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'DOCUMENT_TEXT_EXTRACTED'
          AND metadata_json->>'version_id' = $2
          AND NOT (metadata_json ? 'body')
          AND NOT (metadata_json ? 'content')
          AND NOT (metadata_json ? 'snippet')
          AND NOT (metadata_json ? 'raw')
      `,
      [tenantBetaId, versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
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

async function revisionRows(versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      change_type: string;
      author_label: string | null;
      before_text: string;
      after_text: string;
      before_text_hash: string;
      after_text_hash: string;
      parser_version: string;
      stale: boolean;
    }>(
      `
        SELECT change_type, author_label, before_text, after_text,
          before_text_hash, after_text_hash, parser_version, stale
        FROM document_revisions
        WHERE tenant_id = $1
          AND version_id = $2
        ORDER BY sequence_no
      `,
      [tenantBetaId, versionId],
    );
    return result.rows;
  });
}

async function annotationRows(versionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      annotation_type: string;
      page_number: number;
      author_label: string | null;
      contents: string;
      contents_hash: string;
      parser_version: string;
      stale: boolean;
    }>(
      `
        SELECT annotation_type, page_number, author_label, contents,
          contents_hash, parser_version, stale
        FROM document_annotations
        WHERE tenant_id = $1
          AND version_id = $2
        ORDER BY sequence_no
      `,
      [tenantBetaId, versionId],
    );
    return result.rows;
  });
}

async function revisionCountVisibleFromAlpha(versionId: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_revisions
        WHERE version_id = $1
      `,
      [versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function annotationCountVisibleFromAlpha(versionId: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_annotations
        WHERE version_id = $1
      `,
      [versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function markupAuditCount(
  versionId: string,
  action: 'DOCUMENT_REVISIONS_EXTRACTED' | 'DOCUMENT_ANNOTATIONS_EXTRACTED',
): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND metadata_json->>'version_id' = $3
          AND metadata_json->>'item_count' = '1'
          AND metadata_json->>'parser_status' = 'success'
          AND metadata_json ? 'hash'
          AND NOT (metadata_json ? 'body')
          AND NOT (metadata_json ? 'content')
          AND NOT (metadata_json ? 'text')
          AND NOT (metadata_json ? 'snippet')
          AND NOT (metadata_json ? 'raw')
      `,
      [tenantBetaId, action, versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function rejectOutOfRangeConfidence(versionId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await expect(
      client.query(
        `
          UPDATE canonical_documents
          SET confidence = 1.001
          WHERE tenant_id = $1
            AND version_id = $2
        `,
        [tenantBetaId, versionId],
      ),
    ).rejects.toThrow(/canonical_documents_confidence_check/);
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

function startMockWorker(): Promise<{ server: Server; url: string; bodies: string[] }> {
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => {
      const multipart = Buffer.concat(chunks).toString('utf8');
      bodies.push(multipart);
      expect(request.headers['x-amic-tenant-id']).toBe(tenantBetaId);
      if (request.url === '/extract-revisions') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ready',
            revisions: [
              {
                change_type: 'insert',
                author: 'Integration Reviewer',
                date: '2026-07-04T09:00:00.000Z',
                before_text: '',
                after_text: 'Inserted integration clause',
              },
            ],
          }),
        );
        return;
      }
      if (request.url === '/extract-annotations') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ready',
            annotations: [
              {
                annotation_type: 'highlight',
                page: 1,
                author: 'Integration Reviewer',
                contents: 'Annotated integration obligation',
                rect: [10, 20, 30, 40],
              },
            ],
          }),
        );
        return;
      }
      const isTextUpload = multipart.includes('Plaintext.txt');
      const isDocxUpload = multipart.includes('TrackedChanges.docx');
      const isDocUpload = multipart.includes('LegacyDoc.doc');
      const isXlsUpload = multipart.includes('LegacySheet.xls');
      const isPptUpload = multipart.includes('LegacyDeck.ppt');
      const isHwpUpload = multipart.includes('CourtFiling.hwp');
      const isXlsxUpload = multipart.includes('Workbook.xlsx');
      const isPptxUpload = multipart.includes('Deck.pptx');
      const extractionMethod = isTextUpload
        ? 'text'
        : isDocxUpload
          ? 'docx'
          : isDocUpload
            ? 'doc'
            : isXlsUpload
              ? 'xls'
              : isPptUpload
                ? 'ppt'
                : isHwpUpload
                  ? 'hwp5'
                  : isXlsxUpload
                    ? 'xlsx'
                    : isPptxUpload
                      ? 'pptx'
                      : 'pdf_text';
      const bodyText = isTextUpload
        ? 'Plain worker extracted text'
        : isDocxUpload
          ? 'DOCX worker extracted text'
          : isDocUpload
            ? 'Legacy doc worker extracted text'
            : isXlsUpload
              ? 'Legacy xls worker extracted text'
              : isPptUpload
                ? 'Legacy ppt worker extracted text'
                : isHwpUpload
                  ? '법원 제출 서면 HWP worker extracted text'
                  : isXlsxUpload
                    ? 'Spreadsheet worker extracted text'
                    : isPptxUpload
                      ? 'Presentation worker extracted text'
                      : 'Mock worker extracted text';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ready',
          extraction_method: extractionMethod,
          body_text: bodyText,
          confidence: 1,
          failure_reason_code: null,
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}`, bodies });
    });
  });
}

describe('document extraction integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let matterId: string;
  let mockWorker: Awaited<ReturnType<typeof startMockWorker>>;
  let previousWorkerUrl: string | undefined;
  let previousQueueWorkerEnabled: string | undefined;
  const storageUris: string[] = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousQueueWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    mockWorker = await startMockWorker();
    process.env.INGESTION_WORKER_URL = mockWorker.url;
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = '0';

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
    await ensureFreshMatterAppSyncState();
    const clientId = await createClient(baseUrl, cookie);
    matterId = await createMatter(baseUrl, cookie, clientId);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri);
    }
    await app.close();
    await new Promise<void>((resolve) => mockWorker.server.close(() => resolve()));
    if (previousWorkerUrl === undefined) {
      delete process.env.INGESTION_WORKER_URL;
    } else {
      process.env.INGESTION_WORKER_URL = previousWorkerUrl;
    }
    if (previousQueueWorkerEnabled === undefined) {
      delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    } else {
      process.env.EXTRACTION_QUEUE_WORKER_ENABLED = previousQueueWorkerEnabled;
    }
  });

  it('enqueues reference-only extraction jobs and stores worker results with reference-only audit', async () => {
    const uploaded = await uploadDocument(baseUrl, cookie, matterId);
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'pending',
      extraction_method: 'pending',
      confidence: '0.000',
      body_text: '',
      failure_reason_code: null,
    });

    const job = await extractionJob(version.version_id);
    expect(job.data).toEqual({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      versionId: version.version_id,
      fileObjectId: uploaded.fileObjectId,
    });
    expect(job).toMatchObject({
      retry_limit: 3,
      retry_delay: 1,
      retry_backoff: true,
      dead_letter: 'ingestion.extract.dead',
      singleton_key: version.version_id,
    });
    expect(JSON.stringify(job.data)).not.toContain('EXTRACTION-FIXTURE');

    await app.get(ExtractionDispatcher).handle(job.data);

    expect(mockWorker.bodies.join('\n')).not.toContain('Mock worker extracted text');
    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ready',
      extraction_method: 'pdf_text',
      confidence: '1.000',
      body_text: 'Mock worker extracted text',
      failure_reason_code: null,
    });
    await expect(extractionAuditCount(version.version_id)).resolves.toBe(1);
    await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);
    await rejectOutOfRangeConfidence(version.version_id);

    const detail = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie },
    });
    const detailBody = await detail.text();
    expect(detail.status, detailBody).toBe(200);
    expect(JSON.parse(detailBody)).toMatchObject({
      documentId: uploaded.documentId,
      extractionStatus: 'ready',
      extractionMethod: 'pdf_text',
      extractionConfidence: 1,
    });
    expect(detailBody).not.toContain('Mock worker extracted text');
  });

  it('persists DOCX revision extraction rows with audit metadata and tenant RLS isolation', async () => {
    const uploaded = await uploadDocument(baseUrl, cookie, matterId, {
      filename: 'TrackedChanges.docx',
      bytes: docxUploadBytes,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    const job = await extractionJob(version.version_id);
    await app.get(ExtractionDispatcher).handle(job.data);

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ready',
      extraction_method: 'docx',
      confidence: '1.000',
      body_text: 'DOCX worker extracted text',
      failure_reason_code: null,
    });
    await expect(revisionRows(version.version_id)).resolves.toEqual([
      expect.objectContaining({
        change_type: 'insert',
        author_label: 'Integration Reviewer',
        before_text: '',
        after_text: 'Inserted integration clause',
        before_text_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        after_text_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        parser_version: 'b10-worker-v1',
        stale: false,
      }),
    ]);
    await expect(
      markupAuditCount(version.version_id, 'DOCUMENT_REVISIONS_EXTRACTED'),
    ).resolves.toBe(1);
    await expect(revisionCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);
  });

  it('persists PDF annotations with audit metadata and tenant RLS isolation', async () => {
    const uploaded = await uploadDocument(baseUrl, cookie, matterId, {
      filename: 'AnnotatedEvidence.pdf',
      bytes: Buffer.from(`%PDF-1.7\nANNOTATION-FIXTURE-${randomUUID()}\n`),
      contentType: 'application/pdf',
    });
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    const job = await extractionJob(version.version_id);
    await app.get(ExtractionDispatcher).handle(job.data);

    await expect(annotationRows(version.version_id)).resolves.toEqual([
      expect.objectContaining({
        annotation_type: 'highlight',
        page_number: 1,
        author_label: 'Integration Reviewer',
        contents: 'Annotated integration obligation',
        contents_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        parser_version: 'b10-worker-v1',
        stale: false,
      }),
    ]);
    await expect(
      markupAuditCount(version.version_id, 'DOCUMENT_ANNOTATIONS_EXTRACTED'),
    ).resolves.toBe(1);
    await expect(annotationCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);
  });

  it('stores plaintext extraction methods through the dispatcher and canonical DB constraint', async () => {
    const uploaded = await uploadDocument(baseUrl, cookie, matterId, {
      filename: 'Plaintext.txt',
      bytes: Buffer.from('Plain upload body should not appear in job payload'),
      contentType: 'text/plain',
    });
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    const job = await extractionJob(version.version_id);
    expect(JSON.stringify(job.data)).not.toContain('Plain upload body');

    await app.get(ExtractionDispatcher).handle(job.data);

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ready',
      extraction_method: 'text',
      confidence: '1.000',
      body_text: 'Plain worker extracted text',
      failure_reason_code: null,
    });
    await expect(extractionAuditCount(version.version_id)).resolves.toBe(1);
    await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);
  });

  it('stores OpenXML office extraction methods and enqueues search indexing', async () => {
    const cases = [
      {
        filename: 'Workbook.xlsx',
        bytes: xlsxUploadBytes,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        method: 'xlsx',
        text: 'Spreadsheet worker extracted text',
      },
      {
        filename: 'Deck.pptx',
        bytes: pptxUploadBytes,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        method: 'pptx',
        text: 'Presentation worker extracted text',
      },
    ];

    for (const officeCase of cases) {
      const uploaded = await uploadDocument(baseUrl, cookie, matterId, officeCase);
      const version = await currentVersion(uploaded.documentId);
      storageUris.push(version.storage_uri);

      const job = await extractionJob(version.version_id);
      expect(JSON.stringify(job.data)).not.toContain(officeCase.text);

      await app.get(ExtractionDispatcher).handle(job.data);

      await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
        extraction_status: 'ready',
        extraction_method: officeCase.method,
        confidence: '1.000',
        body_text: officeCase.text,
        failure_reason_code: null,
      });
      await expect(extractionAuditCount(version.version_id)).resolves.toBe(1);
      await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);

      const indexJob = await searchIndexJob(version.version_id);
      expect(indexJob).toMatchObject({
        data: {
          tenantId: tenantBetaId,
          documentId: uploaded.documentId,
          versionId: version.version_id,
        },
        retry_limit: 5,
        retry_delay: 1,
        retry_backoff: true,
        dead_letter: 'search.index.dead',
        singleton_key: version.version_id,
      });

      await app.get(IndexingProcessor).handle(indexJob.data);
      await expect(searchDocumentIds(baseUrl, cookie, officeCase.text)).resolves.toContain(
        uploaded.documentId,
      );
    }
  });

  it('stores legacy Office extraction methods and enqueues search indexing', async () => {
    const cases = [
      {
        filename: 'LegacyDoc.doc',
        bytes: legacyDocBytes,
        contentType: 'application/msword',
        method: 'doc',
        text: 'Legacy doc worker extracted text',
      },
      {
        filename: 'LegacySheet.xls',
        bytes: legacyXlsBytes,
        contentType: 'application/vnd.ms-excel',
        method: 'xls',
        text: 'Legacy xls worker extracted text',
      },
      {
        filename: 'LegacyDeck.ppt',
        bytes: legacyPptBytes,
        contentType: 'application/vnd.ms-powerpoint',
        method: 'ppt',
        text: 'Legacy ppt worker extracted text',
      },
    ];

    for (const officeCase of cases) {
      const uploaded = await uploadDocument(baseUrl, cookie, matterId, officeCase);
      const version = await currentVersion(uploaded.documentId);
      storageUris.push(version.storage_uri);

      const job = await extractionJob(version.version_id);
      expect(JSON.stringify(job.data)).not.toContain(officeCase.text);

      await app.get(ExtractionDispatcher).handle(job.data);

      await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
        extraction_status: 'ready',
        extraction_method: officeCase.method,
        confidence: '1.000',
        body_text: officeCase.text,
        failure_reason_code: null,
      });
      await expect(extractionAuditCount(version.version_id)).resolves.toBe(1);
      await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);

      const indexJob = await searchIndexJob(version.version_id);
      expect(indexJob).toMatchObject({
        data: {
          tenantId: tenantBetaId,
          documentId: uploaded.documentId,
          versionId: version.version_id,
        },
        retry_limit: 5,
        retry_delay: 1,
        retry_backoff: true,
        dead_letter: 'search.index.dead',
        singleton_key: version.version_id,
      });

      await app.get(IndexingProcessor).handle(indexJob.data);
      await expect(searchDocumentIds(baseUrl, cookie, officeCase.text)).resolves.toContain(
        uploaded.documentId,
      );
    }
  });

  it('stores HWP5 extraction method and enqueues search indexing', async () => {
    const uploaded = await uploadDocument(baseUrl, cookie, matterId, {
      filename: 'CourtFiling.hwp',
      bytes: hwp5Bytes,
      contentType: 'application/x-hwp',
    });
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    const job = await extractionJob(version.version_id);
    expect(JSON.stringify(job.data)).not.toContain('법원 제출 서면');

    await app.get(ExtractionDispatcher).handle(job.data);

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'ready',
      extraction_method: 'hwp5',
      confidence: '1.000',
      body_text: '법원 제출 서면 HWP worker extracted text',
      failure_reason_code: null,
    });
    await expect(extractionAuditCount(version.version_id)).resolves.toBe(1);
    await expect(canonicalCountVisibleFromAlpha(version.version_id)).resolves.toBe(0);

    const indexJob = await searchIndexJob(version.version_id);
    expect(indexJob).toMatchObject({
      data: {
        tenantId: tenantBetaId,
        documentId: uploaded.documentId,
        versionId: version.version_id,
      },
      retry_limit: 5,
      retry_delay: 1,
      retry_backoff: true,
      dead_letter: 'search.index.dead',
      singleton_key: version.version_id,
    });

    await app.get(IndexingProcessor).handle(indexJob.data);
    await expect(searchDocumentIds(baseUrl, cookie, '법원 제출 서면')).resolves.toContain(
      uploaded.documentId,
    );
  });
});
