import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createClient,
  createMatter,
  createStorageService,
  docxBytes,
  ensureFreshMatterAppSyncState,
  loginBetaOwner,
  storageUrisForDocument,
  uploadDocx,
} from './document-api-helpers';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

interface VersionListResponse {
  items: Array<{
    versionId: string;
    versionNo: number;
    versionStatus: 'current' | 'superseded';
    fileHash: string;
  }>;
}

interface EditSessionResponse {
  editSessionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  status: 'active' | 'checked_in' | 'cancelled' | 'expired' | 'conflicted';
  lockToken?: string;
}

interface SubversionRevisionResponse {
  changeType: 'insert' | 'delete' | 'move_from' | 'move_to' | 'format';
  author: string | null;
  changedAt: string | null;
  beforeText: string;
  afterText: string;
}

interface SubversionResponse {
  subversionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  subversionNo: number;
  displayVersion: string;
  status: 'saved' | 'submitted' | 'abandoned' | 'promoted';
  visibilityScope: 'session_owner' | 'reviewers' | 'matter_owners' | 'matter_editors';
  revisionSummary: {
    totalCount: number;
    insertCount: number;
    deleteCount: number;
    moveCount: number;
    formatCount: number;
  };
  revisions: SubversionRevisionResponse[];
}

interface SubversionListResponse {
  items: SubversionResponse[];
}

async function expectJson<T>(response: Response, expectedStatus: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(expectedStatus);
  return JSON.parse(body) as T;
}

async function listVersions(
  baseUrl: string,
  cookie: string,
  documentId: string,
): Promise<VersionListResponse> {
  return expectJson<VersionListResponse>(
    await fetch(`${baseUrl}/v1/documents/${documentId}/versions`, {
      headers: { cookie },
    }),
    200,
  );
}

function subversionForm(input: {
  marker: string;
  lockToken: string;
  baseHash: string;
  clientSaveId: string;
}): FormData {
  const form = new FormData();
  form.append('visibilityScope', 'reviewers');
  form.append('saveReasonCode', 'B10_REVIEW_UPLOAD');
  form.append('clientSaveId', input.clientSaveId);
  form.append('expectedBaseSha256', input.baseHash);
  form.append('editPackageMode', 'binary_roundtrip');
  form.append('lockToken', input.lockToken);
  form.append(
    'file',
    new Blob([new Uint8Array(docxBytes(input.marker))], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    `TrackedChanges-${input.marker}.docx`,
  );
  return form;
}

function startRevisionWorker(): Promise<{
  server: Server;
  url: string;
  calls: Array<{ path: string; tenantHeader: string | undefined; body: string }>;
}> {
  const calls: Array<{ path: string; tenantHeader: string | undefined; body: string }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      calls.push({
        path: request.url ?? '',
        tenantHeader: Array.isArray(request.headers['x-amic-tenant-id'])
          ? request.headers['x-amic-tenant-id'][0]
          : request.headers['x-amic-tenant-id'],
        body,
      });
      if (request.url === '/extract-revisions') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ready',
            revisions: [
              {
                change_type: 'insert',
                author: 'Counterparty Reviewer',
                date: '2026-07-04T09:00:00.000Z',
                before_text: '',
                after_text: 'Inserted indemnity qualifier',
              },
              {
                change_type: 'delete',
                author: 'Counterparty Reviewer',
                date: '2026-07-04T09:05:00.000Z',
                before_text: 'Deleted unilateral termination sentence',
                after_text: '',
              },
            ],
          }),
        );
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'docx',
          body_text: 'B10 revision test extraction fallback',
          confidence: 1,
          failure_reason_code: null,
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}`, calls });
    });
  });
}

async function subversionRevisionRows(subversionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      sequence_no: number;
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
        SELECT sequence_no, change_type, author_label, before_text, after_text,
          before_text_hash, after_text_hash, parser_version, stale
        FROM document_revisions
        WHERE tenant_id = $1
          AND subversion_id = $2
        ORDER BY sequence_no
      `,
      [tenantBetaId, subversionId],
    );
    return result.rows;
  });
}

async function revisionCountVisibleFromAlpha(subversionId: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_revisions
        WHERE subversion_id = $1
      `,
      [subversionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function revisionAuditMetadata(input: { documentId: string; subversionId: string }) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'DOCUMENT_REVISIONS_EXTRACTED'
          AND metadata_json->>'subversion_id' = $3
          AND metadata_json->>'item_count' = '2'
          AND metadata_json->>'parser_status' = 'success'
          AND metadata_json ? 'hash'
          AND NOT (metadata_json ? 'body')
          AND NOT (metadata_json ? 'content')
          AND NOT (metadata_json ? 'text')
          AND NOT (metadata_json ? 'snippet')
          AND NOT (metadata_json ? 'raw')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, input.documentId, input.subversionId],
    );
    return result.rows[0]?.metadata_json;
  });
}

describe('document revisions integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let previousWorkerUrl: string | undefined;
  let previousQueueWorkerEnabled: string | undefined;
  let revisionWorker: Awaited<ReturnType<typeof startRevisionWorker>>;
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    previousWorkerUrl = process.env.INGESTION_WORKER_URL;
    previousQueueWorkerEnabled = process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    revisionWorker = await startRevisionWorker();
    process.env.INGESTION_WORKER_URL = revisionWorker.url;
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = '0';

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState(tenantBetaId, 'b10_document_revisions');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(documentId)) {
        await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
      }
    }
    await app.close();
    await new Promise<void>((resolve) => revisionWorker.server.close(() => resolve()));
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

  it('stores DOCX subversion Track Changes and returns them through the review API path', async () => {
    const marker = `b10-revisions-${randomUUID()}`;
    const clientId = await createClient(baseUrl, ownerCookie, marker);
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, marker);
    const uploaded = await uploadDocx(baseUrl, ownerCookie, matterId, marker);
    createdDocumentIds.push(uploaded.documentId);

    const versions = await listVersions(baseUrl, ownerCookie, uploaded.documentId);
    const baseVersion = versions.items[0];
    expect(baseVersion).toMatchObject({ versionNo: 1, versionStatus: 'current' });

    const checkout = await expectJson<EditSessionResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          baseVersionId: baseVersion?.versionId,
          clientKind: 'web_upload',
          checkoutReasonCode: 'WEB_EDIT',
          idempotencyKey: `checkout:${marker}`,
        }),
      }),
      201,
    );
    expect(checkout.lockToken).toMatch(/^[a-f0-9]{64}$/);

    const saved = await expectJson<SubversionResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions/${checkout.editSessionId}/subversions`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie },
          body: subversionForm({
            marker,
            lockToken: checkout.lockToken ?? '',
            baseHash: baseVersion?.fileHash ?? '',
            clientSaveId: `save:${marker}`,
          }),
        },
      ),
      201,
    );

    expect(saved).toMatchObject({
      baseVersionNo: 1,
      displayVersion: 'v1.1',
      status: 'saved',
      visibilityScope: 'reviewers',
      revisionSummary: {
        totalCount: 2,
        insertCount: 1,
        deleteCount: 1,
        moveCount: 0,
        formatCount: 0,
      },
    });
    expect(saved.revisions).toEqual([
      {
        changeType: 'insert',
        author: 'Counterparty Reviewer',
        changedAt: '2026-07-04T09:00:00.000Z',
        beforeText: '',
        afterText: 'Inserted indemnity qualifier',
      },
      {
        changeType: 'delete',
        author: 'Counterparty Reviewer',
        changedAt: '2026-07-04T09:05:00.000Z',
        beforeText: 'Deleted unilateral termination sentence',
        afterText: '',
      },
    ]);

    const subversionList = await expectJson<SubversionListResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/subversions`, {
        headers: { cookie: ownerCookie },
      }),
      200,
    );
    expect(subversionList.items).toHaveLength(1);
    expect(subversionList.items[0]).toMatchObject({
      subversionId: saved.subversionId,
      revisionSummary: saved.revisionSummary,
      revisions: saved.revisions,
    });

    await expect(subversionRevisionRows(saved.subversionId)).resolves.toMatchObject([
      {
        sequence_no: 0,
        change_type: 'insert',
        author_label: 'Counterparty Reviewer',
        before_text: '',
        after_text: 'Inserted indemnity qualifier',
        parser_version: 'b10-worker-v1',
        stale: false,
      },
      {
        sequence_no: 1,
        change_type: 'delete',
        author_label: 'Counterparty Reviewer',
        before_text: 'Deleted unilateral termination sentence',
        after_text: '',
        parser_version: 'b10-worker-v1',
        stale: false,
      },
    ]);
    await expect(revisionCountVisibleFromAlpha(saved.subversionId)).resolves.toBe(0);

    const metadata = await revisionAuditMetadata({
      documentId: uploaded.documentId,
      subversionId: saved.subversionId,
    });
    expect(metadata).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: baseVersion?.versionId,
      subversion_id: saved.subversionId,
      item_count: 2,
      parser_status: 'success',
    });
    const metadataText = JSON.stringify(metadata);
    expect(metadataText).not.toContain('Inserted indemnity qualifier');
    expect(metadataText).not.toContain('Deleted unilateral termination sentence');

    expect(revisionWorker.calls.some((call) => call.path === '/extract-revisions')).toBe(true);
    expect(
      revisionWorker.calls
        .filter((call) => call.path === '/extract-revisions')
        .every((call) => call.tenantHeader === tenantBetaId && call.body.includes('TrackedChanges')),
    ).toBe(true);
  });
});
