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

function uploadForm(filename: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.append('title', `Extraction Draft ${randomUUID()}`);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  return form;
}

async function uploadDocument(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm('Extraction.pdf', Buffer.from('%PDF-1.7\nEXTRACTION-FIXTURE\n')),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
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
      bodies.push(Buffer.concat(chunks).toString('utf8'));
      expect(request.headers['x-amic-tenant-id']).toBe(tenantBetaId);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'pdf_text',
          body_text: 'Mock worker extracted text',
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
});
