import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../../apps/api/src/app.module';
import { configureApp } from '../../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../../apps/api/src/modules/auth/session.repository';
import { NoopEncryptionHook } from '../../../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, tenantBetaId, withClient } from '../../helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface UploadResponse {
  documentId: string;
  matterId: string;
  fileObjectId: string;
  duplicates: Array<{ documentId: string; fileObjectId: string; sha256: string }>;
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
    body: JSON.stringify({ name: `Immutability Client ${randomUUID()}` }),
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
      matterCode: `IMM-${randomUUID()}`,
      matterName: `Immutable Original ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

function uploadForm(bytes: Uint8Array, filename: string): FormData {
  const form = new FormData();
  form.append('title', `Immutable Upload ${randomUUID()}`);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  return form;
}

async function upload(
  baseUrl: string,
  cookie: string,
  matterId: string,
  bytes: Uint8Array,
  filename: string,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm(bytes, filename),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function uploadedRow(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      tenant_id: string;
      matter_id: string;
      document_id: string;
      file_object_id: string;
      storage_uri: string;
      sha256: string;
    }>(
      `
        SELECT d.tenant_id, d.matter_id, d.document_id, f.file_object_id, f.storage_uri, f.sha256
        FROM documents d
        JOIN file_objects f
          ON f.storage_uri LIKE ('s3://amic-vault-dev/tenants/' || d.tenant_id || '/matters/' || d.matter_id || '/documents/' || d.document_id || '/%')
        WHERE d.document_id = $1
        LIMIT 1
      `,
      [documentId],
    );
    return result.rows[0];
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('document-immutability original object integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let matterId: string;
  const createdObjects: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl);
    const clientId = await createClient(baseUrl, ownerCookie);
    matterId = await createMatter(baseUrl, ownerCookie, clientId);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of createdObjects) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri);
    }
    await app.close();
  });

  it('blocks object re-put and file_objects mutation while new uploads create new rows', async () => {
    const bytes = Buffer.from('%PDF-1.7\nFIXMARK-IMMUTABLE-ORIGINAL\n');
    const first = await upload(baseUrl, ownerCookie, matterId, bytes, 'Immutable.pdf');
    const second = await upload(baseUrl, ownerCookie, matterId, bytes, 'Immutable-Copy.pdf');
    const firstRow = await uploadedRow(first.documentId);
    const secondRow = await uploadedRow(second.documentId);

    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    if (!firstRow || !secondRow) throw new Error('uploaded rows missing');
    createdObjects.push(firstRow.storage_uri, secondRow.storage_uri);

    expect(second.fileObjectId).not.toBe(first.fileObjectId);
    expect(secondRow.file_object_id).not.toBe(firstRow.file_object_id);
    expect(secondRow.sha256).toBe(firstRow.sha256);
    expect(second.duplicates).toEqual([
      {
        documentId: first.documentId,
        fileObjectId: first.fileObjectId,
        sha256: firstRow.sha256,
      },
    ]);

    await expect(
      createStorageService().putTenantObject({
        tenantId: tenantBetaId,
        matterId,
        documentId: first.documentId,
        fileObjectId: first.fileObjectId,
        body: Buffer.from('%PDF overwritten'),
        contentLength: Buffer.byteLength('%PDF overwritten'),
        contentType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ name: 'StorageObjectAlreadyExistsError' });

    await withClient(createOwnerClient(), async (client) => {
      await expect(
        client.query(
          'UPDATE file_objects SET sha256 = $1 WHERE tenant_id = $2 AND file_object_id = $3',
          ['f'.repeat(64), tenantBetaId, first.fileObjectId],
        ),
      ).rejects.toThrow(/file_objects immutable original row/);
      await expect(
        client.query('DELETE FROM file_objects WHERE tenant_id = $1 AND file_object_id = $2', [
          tenantBetaId,
          first.fileObjectId,
        ]),
      ).rejects.toThrow(/file_objects immutable original row/);
    });
  });
});
