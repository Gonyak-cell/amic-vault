import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { BulkUploadBatchDto, RegisterBulkUploadBatchDto } from '@amic-vault/shared';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createClient,
  createMatter,
  createStorageService,
  ensureFreshMatterAppSyncState,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';
import { createOwnerClient, setTenant, tenantBetaId, withClient } from '../helpers/db';

function pdfBytes(marker: string): Buffer {
  return Buffer.from(`%PDF-1.7\nB7 ${marker}\n`);
}

async function writeStageFile(dir: string, name: string, body: Buffer): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, body);
  return path;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: Array<{ name: string; body: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.body.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.body.length, 20);
    central.writeUInt32LE(file.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.body.length;
  }
  const centralStart = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

async function zipChildRows(parentDocumentId: string): Promise<
  Array<{
    zipEntryPath: string;
    childDocumentId: string;
    title: string;
    originalFilename: string;
  }>
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query<{
      zip_entry_path: string;
      child_document_id: string;
      title: string;
      original_filename: string;
    }>(
      `
        SELECT z.zip_entry_path, z.child_document_id, d.title, f.original_filename
        FROM document_zip_children z
        JOIN documents d
          ON d.tenant_id = z.tenant_id
          AND d.document_id = z.child_document_id
        JOIN document_versions v
          ON v.tenant_id = d.tenant_id
          AND v.document_id = d.document_id
          AND v.version_no = 1
        JOIN file_objects f
          ON f.tenant_id = v.tenant_id
          AND f.file_object_id = v.file_object_id
        WHERE z.tenant_id = $1
          AND z.parent_document_id = $2
        ORDER BY z.zip_entry_path ASC
      `,
      [tenantBetaId, parentDocumentId],
    );
    return result.rows.map((row) => ({
      zipEntryPath: row.zip_entry_path,
      childDocumentId: row.child_document_id,
      title: row.title,
      originalFilename: row.original_filename,
    }));
  });
}

async function getBatch(
  baseUrl: string,
  cookie: string,
  matterId: string,
  batchId: string,
): Promise<BulkUploadBatchDto> {
  const response = await fetch(
    `${baseUrl}/v1/matters/${matterId}/documents/bulk-upload-batches/${batchId}`,
    { headers: { cookie } },
  );
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as BulkUploadBatchDto;
}

async function waitForBatch(
  baseUrl: string,
  cookie: string,
  matterId: string,
  batchId: string,
  predicate: (batch: BulkUploadBatchDto) => boolean,
): Promise<BulkUploadBatchDto> {
  let latest = await getBatch(baseUrl, cookie, matterId, batchId);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (predicate(latest)) return latest;
    await delay(250);
    latest = await getBatch(baseUrl, cookie, matterId, batchId);
  }
  return latest;
}

describe('bulk upload batch integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let betaMatterId: string;
  let tempDir: string;
  const previousEnv = { ...process.env };
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    process.env.BULK_UPLOAD_QUEUE_WORKER_ENABLED = 'true';
    tempDir = await mkdtemp(join(tmpdir(), 'amic-vault-b7-bulk-'));
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState('22222222-2222-4222-8222-222222222222', 'b7_bulk_upload');
    const clientId = await createClient(baseUrl, betaOwnerCookie, `B7 Bulk Client ${randomUUID()}`);
    betaMatterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'B7-BULK');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(documentId)) {
        await storage.deleteByStorageUri('22222222-2222-4222-8222-222222222222', storageUri);
      }
    }
    await app?.close();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    process.env = previousEnv;
  });

  it('registers a 50-file manifest, isolates corrupt and duplicate items, and retries the corrupt item', async () => {
    const duplicateSeed = await uploadPdf(baseUrl, betaOwnerCookie, betaMatterId, 'B7-DUPLICATE-SEED');
    createdDocumentIds.push(duplicateSeed.documentId);

    const items: RegisterBulkUploadBatchDto['items'] = [];
    for (let index = 0; index < 48; index += 1) {
      const name = `b7-${String(index).padStart(2, '0')}.pdf`;
      items.push({
        itemId: `ok-${index}`,
        fields: { title: `B7 Bulk ${index}` },
        file: {
          path: await writeStageFile(tempDir, name, pdfBytes(`ok-${index}`)),
          originalname: name,
          mimetype: 'application/pdf',
          size: pdfBytes(`ok-${index}`).length,
        },
      });
    }
    const corruptPath = await writeStageFile(tempDir, 'b7-corrupt.pdf', Buffer.from('not a pdf'));
    items.push({
      itemId: 'corrupt',
      fields: { title: 'B7 Corrupt' },
      file: {
        path: corruptPath,
        originalname: 'b7-corrupt.pdf',
        mimetype: 'application/pdf',
        size: Buffer.byteLength('not a pdf'),
      },
    });
    const duplicateBody = Buffer.from('%PDF-1.7\nAMIC-B7-DUPLICATE-SEED\n');
    items.push({
      itemId: 'duplicate',
      fields: { title: 'B7 Duplicate' },
      file: {
        path: await writeStageFile(tempDir, 'b7-duplicate.pdf', duplicateBody),
        originalname: 'b7-duplicate.pdf',
        mimetype: 'application/pdf',
        size: duplicateBody.length,
      },
    });

    const registerResponse = await fetch(
      `${baseUrl}/v1/matters/${betaMatterId}/documents/bulk-upload-batches`,
      {
        method: 'POST',
        headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      },
    );
    const registerBody = await registerResponse.text();
    expect(registerResponse.status, registerBody).toBe(201);
    const registered = JSON.parse(registerBody) as BulkUploadBatchDto;
    expect(registered.totalItems).toBe(50);
    expect(registered.uploadedItems).toBe(50);

    const processed = await waitForBatch(
      baseUrl,
      betaOwnerCookie,
      betaMatterId,
      registered.batchId,
      (batch) => batch.doneItems === 48 && batch.failedItems === 1 && batch.duplicateItems === 1,
    );
    expect(processed.doneItems).toBe(48);
    expect(processed.failedItems).toBe(1);
    expect(processed.duplicateItems).toBe(1);
    expect(processed.items.find((item) => item.itemId === 'duplicate')).toMatchObject({
      status: 'duplicate',
      errorReason: 'DUPLICATE_DECISION_REQUIRED',
    });

    for (const item of processed.items) {
      if (item.documentId) createdDocumentIds.push(item.documentId);
    }

    const retryBody = pdfBytes('recovered');
    await writeFile(corruptPath, retryBody);
    const retryResponse = await fetch(
      `${baseUrl}/v1/matters/${betaMatterId}/documents/bulk-upload-batches/${registered.batchId}/items/corrupt/retry`,
      {
        method: 'POST',
        headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { title: 'B7 Recovered' } }),
      },
    );
    const retryText = await retryResponse.text();
    expect(retryResponse.status, retryText).toBe(201);

    const retried = await waitForBatch(
      baseUrl,
      betaOwnerCookie,
      betaMatterId,
      registered.batchId,
      (batch) => batch.doneItems === 49 && batch.failedItems === 0 && batch.duplicateItems === 1,
    );
    expect(retried.doneItems).toBe(49);
    expect(retried.failedItems).toBe(0);
    expect(retried.items.find((item) => item.itemId === 'corrupt')).toMatchObject({
      status: 'done',
      retryCount: 1,
    });
    for (const item of retried.items) {
      if (item.documentId) createdDocumentIds.push(item.documentId);
    }
  }, 90_000);

  it('registers safe ZIP internals as child documents linked to the parent ZIP', async () => {
    const zipBody = storedZip([
      { name: 'children/first.pdf', body: pdfBytes('zip-child-first') },
      { name: 'children/second.pdf', body: pdfBytes('zip-child-second') },
    ]);
    const form = new FormData();
    form.set('title', 'B7 ZIP Parent');
    form.append(
      'file',
      new Blob([new Uint8Array(zipBody)], { type: 'application/zip' }),
      'b7-children.zip',
    );

    const registerResponse = await fetch(
      `${baseUrl}/v1/matters/${betaMatterId}/documents/bulk-upload-batches/stage`,
      {
        method: 'POST',
        headers: { cookie: betaOwnerCookie },
        body: form,
      },
    );
    const registerBody = await registerResponse.text();
    expect(registerResponse.status, registerBody).toBe(201);
    const registered = JSON.parse(registerBody) as BulkUploadBatchDto;

    const processed = await waitForBatch(
      baseUrl,
      betaOwnerCookie,
      betaMatterId,
      registered.batchId,
      (batch) => batch.doneItems === 1,
    );
    const zipItem = processed.items.find(
      (batchItem) => batchItem.originalFilename === 'b7-children.zip',
    );
    expect(zipItem).toMatchObject({ status: 'done' });
    expect(zipItem?.documentId).toBeTruthy();
    if (zipItem?.documentId) createdDocumentIds.push(zipItem.documentId);

    const children = await zipChildRows(zipItem?.documentId ?? '');
    expect(children).toEqual([
      {
        zipEntryPath: 'children/first.pdf',
        childDocumentId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        title: 'first',
        originalFilename: 'first.pdf',
      },
      {
        zipEntryPath: 'children/second.pdf',
        childDocumentId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        title: 'second',
        originalFilename: 'second.pdf',
      },
    ]);
    for (const child of children) createdDocumentIds.push(child.childDocumentId);
  }, 90_000);
});
