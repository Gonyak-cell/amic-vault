import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
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
  duplicates: Array<{ documentId: string; fileObjectId: string; sha256: string }>;
}

interface AddVersionResponse {
  documentId: string;
  matterId: string;
  versionId: string;
  versionNo: number;
  versionStatus: 'current';
  fileObjectId: string;
  sha256: string;
  duplicates: Array<{ documentId: string; fileObjectId: string; sha256: string }>;
}

interface VersionListResponse {
  items: Array<{
    versionId: string;
    documentId: string;
    versionNo: number;
    versionStatus: 'current' | 'superseded';
    fileObjectId: string;
    fileHash: string;
    createdBy: string;
    createdAt: string;
    supersedesVersionId: string | null;
  }>;
}

interface VersionRow {
  version_id: string;
  document_id: string;
  document_family_id: string;
  version_no: number;
  version_status: 'current' | 'superseded';
  file_object_id: string;
  file_hash: string;
  supersedes_version_id: string | null;
  storage_uri: string;
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

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Version Client ${randomUUID()}` }),
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
      matterCode: `VER-${randomUUID()}`,
      matterName: `Document Versioning ${randomUUID()}`,
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
  form.append('title', `Versioned Draft ${randomUUID()}`);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  return form;
}

function versionForm(filename: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  return form;
}

async function upload(
  baseUrl: string,
  cookie: string,
  matterId: string,
  bytes: Uint8Array,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm('Initial.pdf', bytes),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function addVersion(
  baseUrl: string,
  cookie: string,
  documentId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<AddVersionResponse> {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/versions`, {
    method: 'POST',
    headers: { cookie },
    body: versionForm(filename, bytes),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as AddVersionResponse;
}

async function versionRows(documentId: string): Promise<VersionRow[]> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<VersionRow>(
      `
        SELECT dv.version_id, dv.document_id, d.document_family_id, dv.version_no,
          dv.version_status, dv.file_object_id, dv.file_hash, dv.supersedes_version_id,
          f.storage_uri
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
        ORDER BY dv.version_no ASC
      `,
      [tenantBetaId, documentId],
    );
    return result.rows;
  });
}

async function versionAuditCount(documentId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'DOCUMENT_VERSION_ADDED'
      `,
      [tenantBetaId, documentId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function betaVersionCountVisibleFromAlpha(documentId: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM document_versions
        WHERE document_id = $1
      `,
      [documentId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function rejectFamilyMutation(documentId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await expect(
      client.query(
        `
          UPDATE documents
          SET document_family_id = $1
          WHERE tenant_id = $2
            AND document_id = $3
        `,
        [randomUUID(), tenantBetaId, documentId],
      ),
    ).rejects.toThrow(/document_family_id is immutable/);
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('document-versioning integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaMatterId: string;
  const createdDocumentIds: string[] = [];

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
    const clientId = await createClient(baseUrl, betaOwnerCookie);
    betaMatterId = await createMatter(baseUrl, betaOwnerCookie, clientId);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const row of await versionRows(documentId)) {
        await storage.deleteByStorageUri(tenantBetaId, row.storage_uri);
      }
    }
    await app.close();
  });

  it('creates version 1 on upload, adds immutable versions, filters status, and survives concurrent adds', async () => {
    const initialBytes = Buffer.from('%PDF-1.7\nVERSION-SAME\n');
    const uploaded = await upload(baseUrl, betaOwnerCookie, betaMatterId, initialBytes);
    createdDocumentIds.push(uploaded.documentId);

    let rows = await versionRows(uploaded.documentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      document_id: uploaded.documentId,
      document_family_id: uploaded.documentId,
      version_no: 1,
      version_status: 'current',
      file_object_id: uploaded.fileObjectId,
    });
    expect(rows[0]?.file_hash).toMatch(/^[0-9a-f]{64}$/);

    const duplicate = await addVersion(
      baseUrl,
      betaOwnerCookie,
      uploaded.documentId,
      'Duplicate.pdf',
      initialBytes,
    );
    expect(duplicate.versionNo).toBe(2);
    expect(duplicate.duplicates).toEqual([
      {
        documentId: uploaded.documentId,
        fileObjectId: uploaded.fileObjectId,
        sha256: rows[0]?.file_hash,
      },
    ]);

    const changed = await addVersion(
      baseUrl,
      betaOwnerCookie,
      uploaded.documentId,
      'Changed.pdf',
      Buffer.from('%PDF-1.7\nVERSION-CHANGED\n'),
    );
    expect(changed.versionNo).toBe(3);

    const deniedAdd = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie },
      body: versionForm('Denied.pdf', Buffer.from('%PDF-1.7\nDENIED\n')),
    });
    const deniedAddBody = await deniedAdd.text();
    expect(deniedAdd.status, deniedAddBody).toBe(403);
    expect(deniedAddBody).toContain('PERMISSION_DENIED');

    const deniedList = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      headers: { cookie: betaMemberCookie },
    });
    const deniedListBody = await deniedList.text();
    expect(deniedList.status, deniedListBody).toBe(403);
    expect(deniedListBody).not.toContain(uploaded.documentId);

    const invalidFilter = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/versions?status=archived`,
      { headers: { cookie: betaOwnerCookie } },
    );
    expect(invalidFilter.status, await invalidFilter.text()).toBe(400);

    const list = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      headers: { cookie: betaOwnerCookie },
    });
    const listBody = await list.text();
    expect(list.status, listBody).toBe(200);
    const listed = JSON.parse(listBody) as VersionListResponse;
    expect(listed.items.map((item) => item.versionNo)).toEqual([3, 2, 1]);
    expect(listed.items.filter((item) => item.versionStatus === 'current')).toHaveLength(1);
    expect(listed.items[0]?.supersedesVersionId).toBe(listed.items[1]?.versionId);
    expect(listed.items[1]?.supersedesVersionId).toBe(listed.items[2]?.versionId);

    const currentOnly = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/versions?status=current`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const currentBody = await currentOnly.text();
    expect(currentOnly.status, currentBody).toBe(200);
    expect(
      (JSON.parse(currentBody) as VersionListResponse).items.map((item) => item.versionNo),
    ).toEqual([3]);

    const concurrent = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        addVersion(
          baseUrl,
          betaOwnerCookie,
          uploaded.documentId,
          `Concurrent-${index}.pdf`,
          Buffer.from(`%PDF-1.7\nCONCURRENT-${index}\n`),
        ),
      ),
    );
    expect(concurrent.map((item) => item.versionNo).sort((a, b) => a - b)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);

    rows = await versionRows(uploaded.documentId);
    expect(rows.map((row) => row.version_no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(new Set(rows.map((row) => row.file_object_id)).size).toBe(rows.length);
    expect(rows.filter((row) => row.version_status === 'current')).toHaveLength(1);
    expect(rows.at(-1)?.version_status).toBe('current');
    expect(await versionAuditCount(uploaded.documentId)).toBe(12);
    await rejectFamilyMutation(uploaded.documentId);
    await expect(betaVersionCountVisibleFromAlpha(uploaded.documentId)).resolves.toBe(0);

    const alphaList = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      headers: { cookie: alphaOwnerCookie },
    });
    const alphaBody = await alphaList.text();
    expect(alphaList.status, alphaBody).not.toBe(200);
    expect(alphaBody).not.toContain(uploaded.documentId);
  });
});
