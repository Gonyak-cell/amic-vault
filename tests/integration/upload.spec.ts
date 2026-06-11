import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { NoopEncryptionHook } from '../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../apps/api/src/modules/storage/s3-storage.adapter';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { StoragePathResolver } from '../../apps/api/src/modules/storage/storage-path.resolver';
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

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

async function createClient(baseUrl: string, cookie: string, name: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
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
      matterCode: `UP-${randomUUID()}`,
      matterName: `Upload Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

function uploadForm(filename: string, bytes: Uint8Array, type = 'application/pdf'): FormData {
  const form = new FormData();
  form.append('title', 'Uploaded Draft');
  form.append('file', new Blob([bytes], { type }), filename);
  return form;
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

async function uploadedRows(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      document_id: string;
      file_object_id: string;
      storage_uri: string;
      normalized_filename: string;
      size_bytes: string;
    }>(
      `
        SELECT d.document_id, f.file_object_id, f.storage_uri, f.normalized_filename,
          f.size_bytes::text
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

describe('document upload integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaMatterId: string;
  const createdStorageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    betaOwnerCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    betaMemberCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-member@test.local',
      password: 'dev-beta-member-password',
    });
    const clientId = await createClient(baseUrl, betaOwnerCookie, `Upload Client ${randomUUID()}`);
    betaMatterId = await createMatter(baseUrl, betaOwnerCookie, clientId);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of createdStorageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri);
    }
    await app.close();
  });

  it('uploads one document through canUploadToMatter and stores DB/object references', async () => {
    const response = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
      body: uploadForm('계약.PDF', Buffer.from('%PDF test bytes')),
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const uploaded = JSON.parse(body) as { documentId: string; fileObjectId: string; title: string };
    expect(uploaded.title).toBe('Uploaded Draft');

    const row = await uploadedRows(uploaded.documentId);
    expect(row).toMatchObject({
      document_id: uploaded.documentId,
      file_object_id: uploaded.fileObjectId,
      normalized_filename: '계약.PDF',
      size_bytes: String(Buffer.byteLength('%PDF test bytes')),
    });
    expect(row?.storage_uri).toContain(`/tenants/${tenantBetaId}/matters/${betaMatterId}/documents/${uploaded.documentId}/`);
    if (row?.storage_uri) {
      createdStorageUris.push(row.storage_uri);
      await expect(createStorageService().headByStorageUri(tenantBetaId, row.storage_uri)).resolves.toMatchObject({
        contentLength: Buffer.byteLength('%PDF test bytes'),
      });
    }
  });

  it('rejects unauthenticated, non-member, cross-tenant, missing-file, and unsupported extension uploads', async () => {
    const missingAuth = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      body: uploadForm('Denied.pdf', Buffer.from('denied')),
    });
    expect(missingAuth.status, await missingAuth.text()).toBe(401);

    const nonMember = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie },
      body: uploadForm('Denied.pdf', Buffer.from('denied')),
    });
    const nonMemberBody = await nonMember.text();
    expect(nonMember.status, nonMemberBody).toBe(403);
    expect(nonMemberBody).toContain('PERMISSION_DENIED');

    const crossTenant = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      headers: { cookie: alphaOwnerCookie },
      body: uploadForm('Denied.pdf', Buffer.from('denied')),
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(403);
    expect(crossTenantBody).not.toContain(betaMatterId);

    const missingFileForm = new FormData();
    missingFileForm.append('title', 'Missing File');
    const missingFile = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
      body: missingFileForm,
    });
    expect(missingFile.status, await missingFile.text()).toBe(400);

    const unsupported = await fetch(`${baseUrl}/v1/matters/${betaMatterId}/documents`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
      body: uploadForm('payload.pdf.exe', Buffer.from('denied'), 'application/octet-stream'),
    });
    const unsupportedBody = await unsupported.text();
    expect(unsupported.status, unsupportedBody).toBe(415);
    expect(unsupportedBody).toContain('UNSUPPORTED_FILE_TYPE');
  });
});
