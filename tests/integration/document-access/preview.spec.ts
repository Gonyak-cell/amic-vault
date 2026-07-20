import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  PreviewPrecreateQueueService,
  type PreviewPrecreateJobPayload,
} from '../../../apps/api/src/modules/preview/preview-precreate-queue.service';
import { createOwnerClient, tenantBetaId, withClient } from '../helpers/db';
import {
  auditCount,
  betaOwnerUserId,
  createClient,
  createMatter,
  createStorageService,
  latestAuditMetadata,
  loginAlphaOwner,
  loginBetaOwner,
  previewArtifactSummary,
  storageUrisForDocument,
  uploadDocx,
  uploadPdf,
} from './document-api-helpers';

interface PreviewWorkerCall {
  path: string;
  tenantHeader: string | undefined;
}

const xlsxBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml xl/workbook.xml application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'latin1',
);
const pptxBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml ppt/presentation.xml application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'latin1',
);
const legacyDocBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-preview-doc', 'latin1');
const legacyXlsBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-preview-xls', 'latin1');
const legacyPptBytes = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy-preview-ppt', 'latin1');

function officeForm(input: {
  filename: string;
  marker: string;
  bytes: Buffer;
  contentType: string;
}): FormData {
  const form = new FormData();
  form.append('title', `${input.marker} Document`);
  const payload = new Uint8Array(input.bytes.byteLength);
  payload.set(input.bytes);
  form.append('file', new Blob([payload.buffer], { type: input.contentType }), input.filename);
  return form;
}

async function uploadOffice(
  baseUrl: string,
  cookie: string,
  matterId: string,
  input: {
    filename: string;
    marker: string;
    bytes: Buffer;
    contentType: string;
  },
): Promise<{ documentId: string; fileObjectId: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: officeForm(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as { documentId: string; fileObjectId: string };
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
          '{"fixture":"b2_preview"}'::jsonb
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

async function currentVersionForDocument(documentId: string): Promise<{
  versionId: string;
  fileObjectId: string;
}> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ version_id: string; file_object_id: string }>(
      `
        SELECT version_id, file_object_id
        FROM document_versions
        WHERE document_id = $1
          AND version_status = 'current'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [documentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`current version not found for ${documentId}`);
    return { versionId: row.version_id, fileObjectId: row.file_object_id };
  });
}

function startPreviewWorker(): Promise<{
  server: Server;
  url: string;
  calls: PreviewWorkerCall[];
}> {
  const calls: PreviewWorkerCall[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => {
      calls.push({
        path: request.url ?? '',
        tenantHeader: Array.isArray(request.headers['x-amic-tenant-id'])
          ? request.headers['x-amic-tenant-id'][0]
          : request.headers['x-amic-tenant-id'],
      });
      if (request.url !== '/convert/office-to-pdf') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ code: 'NOT_FOUND' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.end('%PDF-1.7\npreview');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}`, calls });
    });
  });
}

describe('preview integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let previousWorkerUrl: string | undefined;
  let previewWorker: Awaited<ReturnType<typeof startPreviewWorker>>;
  const storageUris: string[] = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previewWorker = await startPreviewWorker();
    process.env.INGESTION_WORKER_URL = previewWorker.url;

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState();
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
    await new Promise<void>((resolve) => previewWorker.server.close(() => resolve()));
    if (previousWorkerUrl === undefined) {
      delete process.env.INGESTION_WORKER_URL;
    } else {
      process.env.INGESTION_WORKER_URL = previousWorkerUrl;
    }
  });

  it('streams PDF preview through document permission and records preview VIEWED once', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PREV');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PREV');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-pdf');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(denied.status).toBe(404);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);

    const preview = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(preview.status, await preview.text()).toBe(200);
    expect(preview.headers.get('content-type')).toContain('application/pdf');
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      channel: 'preview',
    });

    const range = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie, range: 'bytes=0-7' },
    });
    const rangeBody = await range.text();
    expect(range.status, rangeBody).toBe(206);
    expect(rangeBody).toBe('%PDF-1.7');
    expect(range.headers.get('content-length')).toBe('8');
    expect(range.headers.get('content-range')).toMatch(/^bytes 0-7\//);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
  });

  it('creates a DOCX preview derivative without adding a document version', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PDOCX');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PDOCX');
    const uploaded = await uploadDocx(baseUrl, betaOwnerCookie, matterId, 'preview-docx');

    const preview = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    const body = await preview.text();
    expect(preview.status, body).toBe(200);
    expect(body.startsWith('%PDF')).toBe(true);
    const summary = await previewArtifactSummary(uploaded.documentId);
    expect(summary).toMatchObject({
      artifact_count: '1',
      version_count: '1',
      preview_file_count: '1',
    });
    expect(summary?.source_systems).toContain('preview_derived');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
  });

  it('creates Office preview derivatives and reuses the cached artifact', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'POFFICE');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'POFFICE');
    const cases = [
      {
        filename: 'preview-workbook.xlsx',
        marker: 'preview-workbook',
        bytes: xlsxBytes,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        filename: 'preview-deck.pptx',
        marker: 'preview-deck',
        bytes: pptxBytes,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      {
        filename: 'preview-legacy-doc.doc',
        marker: 'preview-legacy-doc',
        bytes: legacyDocBytes,
        contentType: 'application/msword',
      },
      {
        filename: 'preview-legacy-sheet.xls',
        marker: 'preview-legacy-sheet',
        bytes: legacyXlsBytes,
        contentType: 'application/vnd.ms-excel',
      },
      {
        filename: 'preview-legacy-deck.ppt',
        marker: 'preview-legacy-deck',
        bytes: legacyPptBytes,
        contentType: 'application/vnd.ms-powerpoint',
      },
    ];

    for (const officeCase of cases) {
      const uploaded = await uploadOffice(baseUrl, betaOwnerCookie, matterId, officeCase);
      const beforeCalls = previewWorker.calls.length;

      const first = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
        headers: { cookie: betaOwnerCookie },
      });
      const firstBody = await first.text();
      expect(first.status, firstBody).toBe(200);
      expect(first.headers.get('content-type')).toContain('application/pdf');
      expect(firstBody.startsWith('%PDF')).toBe(true);
      expect(previewWorker.calls).toHaveLength(beforeCalls + 1);
      expect(previewWorker.calls.at(-1)).toMatchObject({
        path: '/convert/office-to-pdf',
        tenantHeader: tenantBetaId,
      });

      const second = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
        headers: { cookie: betaOwnerCookie },
      });
      expect(second.status, await second.text()).toBe(200);
      expect(previewWorker.calls).toHaveLength(beforeCalls + 1);

      const summary = await previewArtifactSummary(uploaded.documentId);
      expect(summary).toMatchObject({
        artifact_count: '1',
        version_count: '1',
        preview_file_count: '1',
      });
      expect(summary?.source_systems).toContain('preview_derived');
      storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
    }
  });

  it('precreates OpenXML office preview artifacts before first preview open', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PPRE');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PPRE');
    const uploaded = await uploadOffice(baseUrl, betaOwnerCookie, matterId, {
      filename: 'precreate-deck.pptx',
      marker: 'precreate-deck',
      bytes: pptxBytes,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const version = await currentVersionForDocument(uploaded.documentId);
    const precreateQueue = app.get(PreviewPrecreateQueueService);
    const beforeCalls = previewWorker.calls.length;

    await precreateQueue.handle({
      tenantId: tenantBetaId as PreviewPrecreateJobPayload['tenantId'],
      documentId: uploaded.documentId,
      versionId: version.versionId,
      fileObjectId: version.fileObjectId,
      actorUserId: betaOwnerUserId,
    });

    expect(previewWorker.calls).toHaveLength(beforeCalls + 1);
    const summary = await previewArtifactSummary(uploaded.documentId);
    expect(summary).toMatchObject({
      artifact_count: '1',
      version_count: '1',
      preview_file_count: '1',
    });

    const first = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(first.status, await first.text()).toBe(200);
    expect(first.headers.get('content-type')).toContain('application/pdf');
    expect(previewWorker.calls).toHaveLength(beforeCalls + 1);
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
  });
});
