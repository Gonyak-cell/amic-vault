import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApiProcessEnv, configureApp } from '../../apps/api/src/main';
import { bootstrapWorker } from '../../apps/api/src/worker-main';
import {
  aiPrepDeadLetterQueueName,
  aiPrepQueueName,
} from '../../apps/api/src/modules/ai/prep/ai-prep.types';
import {
  extractionDeadLetterQueueName,
  extractionQueueName,
} from '../../apps/api/src/modules/document/extraction/extraction.types';
import {
  searchIndexDeadLetterQueueName,
  searchIndexQueueName,
} from '../../apps/api/src/modules/search/index/indexing.service';
import {
  createClient,
  createMatter,
  createStorageService,
  loginBetaOwner,
} from './document-access/document-api-helpers';
import { createOwnerClient, tenantBetaId, withClient } from './helpers/db';

interface CurrentVersionRow {
  version_id: string;
  storage_uri: string;
}

interface CanonicalRow {
  extraction_status: string;
  body_text: string;
}

interface SearchIndexRow {
  content_text: string;
}

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

function startMockWorker(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'ready',
        extraction_method: 'pdf_text',
        body_text: 'H6 worker process extracted searchable text',
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

async function currentVersion(documentId: string): Promise<CurrentVersionRow> {
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
      [tenantBetaId, documentId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as CurrentVersionRow;
  });
}

async function canonicalRow(versionId: string): Promise<CanonicalRow | null> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<CanonicalRow>(
      `
        SELECT extraction_status, body_text
        FROM canonical_documents
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [tenantBetaId, versionId],
    );
    return result.rows[0] ?? null;
  });
}

async function searchIndexRow(versionId: string): Promise<SearchIndexRow | null> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<SearchIndexRow>(
      `
        SELECT content_text
        FROM document_search_index
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [tenantBetaId, versionId],
    );
    return result.rows[0] ?? null;
  });
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
          '{"fixture":"h6_worker_processing"}'::jsonb
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

async function createUploadPreflight(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents/upload-preflight`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await response.text();
  expect([200, 201], body).toContain(response.status);
  const parsed = JSON.parse(body) as { preflightRef: string };
  expect(parsed.preflightRef).toMatch(/^upf_/);
  return parsed.preflightRef;
}

function pdfForm(marker: string, uploadPreflightRef: string): FormData {
  const bytes = Buffer.from(`%PDF-1.7\nAMIC-${marker}\n`);
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const form = new FormData();
  form.append('title', `${marker} Document`);
  form.append('uploadPreflightRef', uploadPreflightRef);
  form.append('file', new Blob([payload.buffer], { type: 'application/pdf' }), `${marker}.pdf`);
  return form;
}

async function uploadPdfWithPreflight(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
): Promise<UploadResponse> {
  const uploadPreflightRef = await createUploadPreflight(baseUrl, cookie, matterId);
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: pdfForm(marker, uploadPreflightRef),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function waitForWorkerResult(versionId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const canonical = await canonicalRow(versionId);
    const index = await searchIndexRow(versionId);
    if (
      canonical?.extraction_status === 'ready' &&
      canonical.body_text.includes('H6 worker process') &&
      index?.content_text.includes('H6 worker process')
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('worker did not process extraction and indexing queues before timeout');
}

async function purgeWorkerQueueJobs(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client
      .query(
        `
          DELETE FROM pgboss.job
          WHERE name = ANY($1::text[])
        `,
        [
          [
            aiPrepDeadLetterQueueName,
            aiPrepQueueName,
            extractionDeadLetterQueueName,
            extractionQueueName,
            searchIndexDeadLetterQueueName,
            searchIndexQueueName,
          ],
        ],
      )
      .catch(() => undefined);
  });
}

describe('worker processing integration', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplicationContext | null = null;
  let baseUrl: string;
  let mockWorker: Awaited<ReturnType<typeof startMockWorker>>;
  let previousProcessRole: string | undefined;
  let previousWorkerUrl: string | undefined;
  let previousExtractionWorkerEnabled: string | undefined;
  let previousSearchWorkerEnabled: string | undefined;
  let previousAiPrepWorkerEnabled: string | undefined;
  let previousAiPrepEnabled: string | undefined;
  let previousLocalEmbeddingEnabled: string | undefined;
  const storageUris: string[] = [];

  beforeAll(async () => {
    previousProcessRole = process.env.PROCESS_ROLE;
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousExtractionWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    previousSearchWorkerEnabled = process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    previousAiPrepWorkerEnabled = process.env.AI_PREP_QUEUE_WORKER_ENABLED;
    previousAiPrepEnabled = process.env.AI_PREP_ENABLED;
    previousLocalEmbeddingEnabled = process.env.LOCAL_EMBEDDING_ENABLED;

    mockWorker = await startMockWorker();
    process.env.INGESTION_WORKER_URL = mockWorker.url;
    process.env.AI_PREP_ENABLED = 'false';
    process.env.LOCAL_EMBEDDING_ENABLED = '0';
    delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    delete process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;
    delete process.env.AI_PREP_QUEUE_WORKER_ENABLED;
    delete process.env.PROCESS_ROLE;
    configureApiProcessEnv();

    apiApp = await NestFactory.create(AppModule, { logger: false });
    configureApp(apiApp);
    await apiApp.listen(0);
    baseUrl = await apiApp.getUrl();
    await ensureFreshMatterAppSyncState();
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri);
    }
    if (workerApp) await workerApp.close();
    await apiApp.close();
    await new Promise<void>((resolve) => mockWorker.server.close(() => resolve()));
    restoreEnv('PROCESS_ROLE', previousProcessRole);
    restoreEnv('INGESTION_WORKER_URL', previousWorkerUrl);
    restoreEnv('EXTRACTION_QUEUE_WORKER_ENABLED', previousExtractionWorkerEnabled);
    restoreEnv('SEARCH_INDEX_QUEUE_WORKER_ENABLED', previousSearchWorkerEnabled);
    restoreEnv('AI_PREP_QUEUE_WORKER_ENABLED', previousAiPrepWorkerEnabled);
    restoreEnv('AI_PREP_ENABLED', previousAiPrepEnabled);
    restoreEnv('LOCAL_EMBEDDING_ENABLED', previousLocalEmbeddingEnabled);
  });

  it('keeps API enqueue-only, then drains extraction and indexing in a worker context', async () => {
    await purgeWorkerQueueJobs();
    const cookie = await loginBetaOwner(baseUrl);
    const clientId = await createClient(baseUrl, cookie, 'H6 Worker');
    const matterId = await createMatter(baseUrl, cookie, clientId, 'H6-WORKER');
    const uploaded = await uploadPdfWithPreflight(baseUrl, cookie, matterId, 'h6-worker');
    const version = await currentVersion(uploaded.documentId);
    storageUris.push(version.storage_uri);

    await expect(canonicalRow(version.version_id)).resolves.toMatchObject({
      extraction_status: 'pending',
      body_text: '',
    });
    await expect(searchIndexRow(version.version_id)).resolves.toBeNull();

    process.env.PROCESS_ROLE = 'worker';
    workerApp = await bootstrapWorker();

    await waitForWorkerResult(version.version_id);
  }, 30_000);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
