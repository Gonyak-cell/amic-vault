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
import { StoragePathResolver } from '../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface UploadResponse {
  documentId: string;
  matterId: string;
  fileObjectId: string;
  duplicates: Array<{ documentId: string; fileObjectId: string; sha256: string }>;
}

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

async function createMatter(
  baseUrl: string,
  cookie: string,
  input: { clientId: string; leadLawyerId: string; prefix: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      matterCode: `${input.prefix}-${randomUUID()}`,
      matterName: `Document Hash ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: input.leadLawyerId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

function uploadForm(
  filename: string,
  bytes: Uint8Array,
  fields: { duplicateDecision?: 'new_document' } = {},
): FormData {
  const form = new FormData();
  form.append('title', `Hash Upload ${randomUUID()}`);
  if (fields.duplicateDecision) form.append('duplicateDecision', fields.duplicateDecision);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  return form;
}

async function upload(
  baseUrl: string,
  cookie: string,
  matterId: string,
  filename: string,
  bytes: Uint8Array,
  fields: { duplicateDecision?: 'new_document' } = {},
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm(filename, bytes, fields),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function uploadedRow(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      tenant_id: string;
      storage_uri: string;
      sha256: string;
    }>(
      `
        SELECT d.tenant_id, f.storage_uri, f.sha256
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

describe('document hash integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let alphaMatterId: string;
  let betaMatterAId: string;
  let betaMatterBId: string;
  const createdObjects: Array<{ tenantId: string; storageUri: string }> = [];

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

    const alphaClientId = await createClient(
      baseUrl,
      alphaOwnerCookie,
      `Hash Alpha ${randomUUID()}`,
    );
    const betaClientId = await createClient(baseUrl, betaOwnerCookie, `Hash Beta ${randomUUID()}`);
    alphaMatterId = await createMatter(baseUrl, alphaOwnerCookie, {
      clientId: alphaClientId,
      leadLawyerId: alphaOwnerUserId,
      prefix: 'HA',
    });
    betaMatterAId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      leadLawyerId: betaOwnerUserId,
      prefix: 'HBA',
    });
    betaMatterBId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      leadLawyerId: betaOwnerUserId,
      prefix: 'HBB',
    });
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const object of createdObjects) {
      await storage.deleteByStorageUri(object.tenantId, object.storageUri);
    }
    await app.close();
  });

  it('stores SHA-256, keeps one-byte changes distinct, and reports duplicates only inside the same matter', async () => {
    const sameBytes = Buffer.from('%PDF-1.7\nFIXMARK-DOC-HASH-SAME\n');
    const changedBytes = Buffer.from('%PDF-1.7\nFIXMARK-DOC-HASH-SAMF\n');

    const otherMatter = await upload(
      baseUrl,
      betaOwnerCookie,
      betaMatterBId,
      'OtherMatter.pdf',
      sameBytes,
    );
    const otherTenant = await upload(
      baseUrl,
      alphaOwnerCookie,
      alphaMatterId,
      'OtherTenant.pdf',
      sameBytes,
    );
    const first = await upload(baseUrl, betaOwnerCookie, betaMatterAId, 'First.pdf', sameBytes);
    const changed = await upload(
      baseUrl,
      betaOwnerCookie,
      betaMatterAId,
      'Changed.pdf',
      changedBytes,
    );
    const second = await upload(baseUrl, betaOwnerCookie, betaMatterAId, 'Second.pdf', sameBytes, {
      duplicateDecision: 'new_document',
    });

    const rows = await Promise.all(
      [otherMatter, otherTenant, first, changed, second].map(async (uploaded) => {
        const row = await uploadedRow(uploaded.documentId);
        expect(row).toBeDefined();
        if (row) createdObjects.push({ tenantId: row.tenant_id, storageUri: row.storage_uri });
        return row;
      }),
    );
    const [otherMatterRow, otherTenantRow, firstRow, changedRow, secondRow] = rows;

    expect(first.duplicates).toEqual([]);
    expect(changed.duplicates).toEqual([]);
    expect(firstRow?.sha256).toBe(secondRow?.sha256);
    expect(firstRow?.sha256).toBe(otherMatterRow?.sha256);
    expect(firstRow?.sha256).toBe(otherTenantRow?.sha256);
    expect(changedRow?.sha256).not.toBe(firstRow?.sha256);
    expect(second.duplicates).toEqual([
      {
        documentId: first.documentId,
        fileObjectId: first.fileObjectId,
        sha256: firstRow?.sha256,
      },
    ]);
    expect(second.duplicates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentId: otherMatter.documentId }),
        expect.objectContaining({ documentId: otherTenant.documentId }),
      ]),
    );
  });
});
