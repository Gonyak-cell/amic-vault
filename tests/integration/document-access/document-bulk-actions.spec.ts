import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocumentBulkActionBatchDto, TenantId } from '@amic-vault/shared';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { bootstrapWorker } from '../../../apps/api/src/worker-main';
import {
  addBetaMember,
  alphaOwnerUserId,
  betaOwnerUserId,
  createClient,
  createMatter,
  createStorageService,
  ensureFreshMatterAppSyncState,
  loginAlphaOwner,
  loginBetaMember,
  loginBetaOwner,
  setDocumentLegalHold,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const unrelatedWorkerEnvironmentKeys = [
  'AI_PREP_QUEUE_WORKER_ENABLED',
  'AUDIT_ANCHOR_QUEUE_WORKER_ENABLED',
  'BULK_UPLOAD_QUEUE_WORKER_ENABLED',
  'CONTRACT_AI_REVIEW_QUEUE_WORKER_ENABLED',
  'DD_EXPORT_QUEUE_WORKER_ENABLED',
  'DD_RFI_NOTIFICATION_SWEEPER_ENABLED',
  'DLP_BULK_DOWNLOAD_MONITOR_WORKER_ENABLED',
  'DOCUMENT_COMPARISON_QUEUE_WORKER_ENABLED',
  'EDIT_SESSION_SWEEPER_ENABLED',
  'EMAIL_REPARSE_QUEUE_WORKER_ENABLED',
  'EXTRACTION_QUEUE_WORKER_ENABLED',
  'FILE_SECURITY_RECONCILIATION_WORKER_ENABLED',
  'FILE_SECURITY_SCAN_WORKER_ENABLED',
  'GRAPH_SYNC_OUTBOX_WORKER_ENABLED',
  'LAW_AMENDMENT_REFRESH_WORKER_ENABLED',
  'LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_ENABLED',
  'OCR_QUEUE_WORKER_ENABLED',
  'PREVIEW_CONVERT_QUEUE_WORKER_ENABLED',
  'RECORDS_DISPOSAL_WORKER_ENABLED',
  'RETENTION_REVIEW_QUEUE_WORKER_ENABLED',
  'SEARCH_INDEX_QUEUE_WORKER_ENABLED',
] as const;

async function createBatch(
  baseUrl: string,
  cookie: string,
  body: unknown,
): Promise<{ body: DocumentBulkActionBatchDto; status: number }> {
  const response = await fetch(`${baseUrl}/v1/document-bulk-action-batches`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    body: JSON.parse(text) as DocumentBulkActionBatchDto,
    status: response.status,
  };
}

async function getBatch(
  baseUrl: string,
  cookie: string,
  batchId: string,
): Promise<DocumentBulkActionBatchDto> {
  const response = await fetch(`${baseUrl}/v1/document-bulk-action-batches/${batchId}`, {
    headers: { cookie },
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as DocumentBulkActionBatchDto;
}

async function waitForTerminalBatch(
  baseUrl: string,
  cookie: string,
  batchId: string,
): Promise<DocumentBulkActionBatchDto> {
  let batch = await getBatch(baseUrl, cookie, batchId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (['completed', 'partial', 'failed'].includes(batch.status)) return batch;
    await delay(100);
    batch = await getBatch(baseUrl, cookie, batchId);
  }
  return batch;
}

async function documentTags(documentId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query<{ tag: string }>(
      `
        SELECT tag
        FROM document_tags
        WHERE tenant_id = $1
          AND document_id = $2
        ORDER BY tag
      `,
      [tenantBetaId, documentId],
    );
    return result.rows.map((row) => row.tag);
  });
}

async function createFolderFixture(matterId: string): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query<{ folder_id: string }>(
      `
        INSERT INTO document_folders (
          tenant_id,
          matter_id,
          name,
          created_by
        )
        VALUES ($1, $2, $3, $4)
        RETURNING folder_id
      `,
      [tenantBetaId, matterId, `WB04-${randomUUID()}`, betaOwnerUserId],
    );
    const folderId = result.rows[0]?.folder_id;
    if (!folderId) throw new Error('folder fixture insert returned no row');
    return folderId;
  });
}

async function documentFolderId(documentId: string): Promise<string | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query<{ folder_id: string | null }>(
      `
        SELECT folder_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
      `,
      [tenantBetaId, documentId],
    );
    return result.rows[0]?.folder_id ?? null;
  });
}

describe('document bulk actions integration', () => {
  let app: INestApplication;
  let workerApp: INestApplicationContext;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let editableDocumentId: string;
  let deniedDocumentId: string;
  let heldDocumentId: string;
  let otherMatterDocumentId: string;
  let invisibleDocumentId: string;
  let editableMatterFolderId: string;
  let foreignDocumentId: string;
  const previousEnv = { ...process.env };
  const createdDocumentIds: Array<{ documentId: string; tenantId: TenantId }> = [];

  beforeAll(async () => {
    for (const key of unrelatedWorkerEnvironmentKeys) process.env[key] = 'false';
    process.env.DOCUMENT_BULK_ACTION_QUEUE_WORKER_ENABLED = 'true';
    process.env.PROCESS_ROLE = 'api';
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    betaMemberCookie = await loginBetaMember(baseUrl);
    await ensureFreshMatterAppSyncState(tenantAlphaId, 'wb04_document_bulk_actions');
    await ensureFreshMatterAppSyncState(tenantBetaId, 'wb04_document_bulk_actions');

    const editableClientId = await createClient(baseUrl, betaOwnerCookie, 'WB04-EDIT');
    const editableMatterId = await createMatter(
      baseUrl,
      betaOwnerCookie,
      editableClientId,
      'WB04-EDIT',
    );
    await addBetaMember(baseUrl, betaOwnerCookie, editableMatterId, 'edit');
    const editable = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      editableMatterId,
      `WB04 editable ${randomUUID()}`,
    );
    editableDocumentId = editable.documentId;
    createdDocumentIds.push({ documentId: editable.documentId, tenantId: tenantBetaId });
    editableMatterFolderId = await createFolderFixture(editableMatterId);

    const held = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      editableMatterId,
      `WB04 held ${randomUUID()}`,
    );
    heldDocumentId = held.documentId;
    createdDocumentIds.push({ documentId: held.documentId, tenantId: tenantBetaId });

    const deniedClientId = await createClient(baseUrl, betaOwnerCookie, 'WB04-DENY');
    const deniedMatterId = await createMatter(
      baseUrl,
      betaOwnerCookie,
      deniedClientId,
      'WB04-DENY',
    );
    await addBetaMember(baseUrl, betaOwnerCookie, deniedMatterId, 'read');
    const denied = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      deniedMatterId,
      `WB04 denied ${randomUUID()}`,
    );
    deniedDocumentId = denied.documentId;
    createdDocumentIds.push({ documentId: denied.documentId, tenantId: tenantBetaId });

    const otherMatterDocument = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      deniedMatterId,
      `WB04 other matter ${randomUUID()}`,
    );
    otherMatterDocumentId = otherMatterDocument.documentId;
    createdDocumentIds.push({
      documentId: otherMatterDocument.documentId,
      tenantId: tenantBetaId,
    });

    const invisibleClientId = await createClient(baseUrl, betaOwnerCookie, 'WB04-INVISIBLE');
    const invisibleMatterId = await createMatter(
      baseUrl,
      betaOwnerCookie,
      invisibleClientId,
      'WB04-INVISIBLE',
    );
    const invisible = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      invisibleMatterId,
      `WB04 invisible ${randomUUID()}`,
    );
    invisibleDocumentId = invisible.documentId;
    createdDocumentIds.push({
      documentId: invisible.documentId,
      tenantId: tenantBetaId,
    });

    const foreignClientId = await createClient(baseUrl, alphaOwnerCookie, 'WB04-FOREIGN');
    const foreignMatterId = await createMatter(
      baseUrl,
      alphaOwnerCookie,
      foreignClientId,
      'WB04-FOREIGN',
      { leadLawyerId: alphaOwnerUserId },
    );
    const foreign = await uploadPdf(
      baseUrl,
      alphaOwnerCookie,
      foreignMatterId,
      `WB04 foreign ${randomUUID()}`,
    );
    foreignDocumentId = foreign.documentId;
    createdDocumentIds.push({
      documentId: foreign.documentId,
      tenantId: tenantAlphaId as TenantId,
    });

    process.env.PROCESS_ROLE = 'worker';
    workerApp = await bootstrapWorker();
    process.env.PROCESS_ROLE = 'api';
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const created of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(created.documentId)) {
        await storage.deleteByStorageUri(created.tenantId, storageUri);
      }
    }
    await workerApp?.close();
    await app?.close();
    process.env = previousEnv;
  });

  it('processes one item, replays the same idempotency key, and rejects changed replay input', async () => {
    const idempotencyKey = randomUUID();
    const body = {
      action: { kind: 'add_tag', tag: 'wb04-one' },
      documentIds: [editableDocumentId],
      idempotencyKey,
    };
    const [created, concurrentReplay] = await Promise.all([
      createBatch(baseUrl, betaMemberCookie, body),
      createBatch(baseUrl, betaMemberCookie, body),
    ]);
    expect(created.status).toBe(201);
    expect(concurrentReplay.status).toBe(201);
    expect(concurrentReplay.body.batchId).toBe(created.body.batchId);
    const completed = await waitForTerminalBatch(baseUrl, betaMemberCookie, created.body.batchId);
    expect(completed).toMatchObject({
      failedCount: 0,
      status: 'completed',
      succeededCount: 1,
      totalCount: 1,
    });
    expect(await documentTags(editableDocumentId)).toContain('wb04-one');

    const replay = await createBatch(baseUrl, betaMemberCookie, body);
    expect(replay.status).toBe(201);
    expect(replay.body.batchId).toBe(created.body.batchId);

    const changed = await fetch(`${baseUrl}/v1/document-bulk-action-batches`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        action: { kind: 'remove_tag', tag: 'wb04-one' },
      }),
    });
    expect(changed.status).toBe(400);
    expect(await changed.text()).toContain('IDEMPOTENCY_KEY_REUSED');
  });

  it('returns an explicit partial receipt and retries only the denied item', async () => {
    const created = await createBatch(baseUrl, betaMemberCookie, {
      action: { kind: 'add_tag', tag: 'wb04-partial' },
      documentIds: [editableDocumentId, deniedDocumentId],
      idempotencyKey: randomUUID(),
    });
    expect(created.status).toBe(201);
    const partial = await waitForTerminalBatch(baseUrl, betaMemberCookie, created.body.batchId);
    expect(partial).toMatchObject({
      failedCount: 1,
      status: 'partial',
      succeededCount: 1,
      totalCount: 2,
    });
    expect(partial.items).toEqual([
      expect.objectContaining({ documentId: editableDocumentId, status: 'succeeded' }),
      expect.objectContaining({
        documentId: deniedDocumentId,
        errorCode: 'PERMISSION_DENIED',
        status: 'failed',
      }),
    ]);
    expect(await documentTags(editableDocumentId)).toContain('wb04-partial');
    expect(await documentTags(deniedDocumentId)).not.toContain('wb04-partial');

    const retryResponse = await fetch(
      `${baseUrl}/v1/document-bulk-action-batches/${partial.batchId}/retry`,
      {
        method: 'POST',
        headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ itemIds: [partial.items[1]?.itemId] }),
      },
    );
    expect(retryResponse.status, await retryResponse.text()).toBe(201);
    const retried = await waitForTerminalBatch(baseUrl, betaMemberCookie, partial.batchId);
    expect(retried.items[1]).toMatchObject({
      errorCode: 'PERMISSION_DENIED',
      retryCount: 1,
      status: 'failed',
    });

    const auditRows = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ action: string; count: string }>(
        `
          SELECT action, count(*)::text AS count
          FROM audit_events
          WHERE target_id = $1
            AND action LIKE 'DOCUMENT_BULK_ACTION_%'
          GROUP BY action
          ORDER BY action
        `,
        [partial.batchId],
      );
      return result.rows;
    });
    expect(auditRows).toEqual([
      { action: 'DOCUMENT_BULK_ACTION_COMPLETED', count: '2' },
      { action: 'DOCUMENT_BULK_ACTION_CREATED', count: '1' },
      { action: 'DOCUMENT_BULK_ACTION_RETRIED', count: '1' },
    ]);
  });

  it('fails closed before enqueue when a request contains a cross-tenant document ID', async () => {
    const response = await fetch(`${baseUrl}/v1/document-bulk-action-batches`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: { kind: 'add_tag', tag: 'wb04-cross-tenant' },
        documentIds: [editableDocumentId, foreignDocumentId],
        idempotencyKey: randomUUID(),
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(text).toContain('PERMISSION_DENIED');
    expect(text).not.toContain(foreignDocumentId);

    const invisible = await createBatch(baseUrl, betaMemberCookie, {
      action: { kind: 'add_tag', tag: 'wb04-invisible' },
      documentIds: [invisibleDocumentId],
      idempotencyKey: randomUUID(),
    });
    const missing = await createBatch(baseUrl, betaMemberCookie, {
      action: { kind: 'add_tag', tag: 'wb04-missing' },
      documentIds: [randomUUID()],
      idempotencyKey: randomUUID(),
    });
    expect(invisible.status).toBe(404);
    expect(missing.status).toBe(404);
    const { requestId: invisibleRequestId, ...invisibleSafeBody } = invisible.body as unknown as {
      code: string;
      requestId: string;
    };
    const { requestId: missingRequestId, ...missingSafeBody } = missing.body as unknown as {
      code: string;
      requestId: string;
    };
    expect(invisibleSafeBody).toEqual(missingSafeBody);
    expect(invisibleRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(missingRequestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns bounded failures for a legal hold and a folder from another Matter', async () => {
    await setDocumentLegalHold(heldDocumentId, true);
    try {
      const held = await createBatch(baseUrl, betaMemberCookie, {
        action: { kind: 'transition_status', status: 'internal_review' },
        documentIds: [heldDocumentId],
        idempotencyKey: randomUUID(),
      });
      expect(held.status).toBe(201);
      const heldReceipt = await waitForTerminalBatch(baseUrl, betaMemberCookie, held.body.batchId);
      expect(heldReceipt).toMatchObject({
        failedCount: 1,
        status: 'failed',
        succeededCount: 0,
      });
      expect(heldReceipt.items[0]).toMatchObject({
        errorCode: 'DOCUMENT_LOCKED',
        status: 'failed',
      });
    } finally {
      await setDocumentLegalHold(heldDocumentId, false);
    }

    const wrongMatterFolder = await createBatch(baseUrl, betaOwnerCookie, {
      action: { kind: 'move_folder', folderId: editableMatterFolderId },
      documentIds: [otherMatterDocumentId],
      idempotencyKey: randomUUID(),
    });
    expect(wrongMatterFolder.status).toBe(201);
    const wrongMatterReceipt = await waitForTerminalBatch(
      baseUrl,
      betaOwnerCookie,
      wrongMatterFolder.body.batchId,
    );
    expect(wrongMatterReceipt).toMatchObject({
      failedCount: 1,
      status: 'failed',
      succeededCount: 0,
    });
    expect(wrongMatterReceipt.items[0]).toMatchObject({
      errorCode: 'VALIDATION_FAILED',
      status: 'failed',
    });
    expect(await documentFolderId(otherMatterDocumentId)).toBeNull();
  });
});
