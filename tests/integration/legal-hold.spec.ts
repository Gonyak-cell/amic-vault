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
import {
  assertDeletable,
  LegalHoldBlockedError,
} from '../../packages/domain/src/records/legal-hold';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface LegalHoldResponse {
  legalHold: boolean;
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
    body: JSON.stringify({ name: `Legal Hold Client ${randomUUID()}` }),
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
      matterCode: `HOLD-${randomUUID()}`,
      matterName: `Legal Hold ${randomUUID()}`,
      matterType: 'litigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

function uploadForm(filename: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.append('title', `Hold Draft ${randomUUID()}`);
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
  bytes = Buffer.from('%PDF-1.7\nLEGAL-HOLD\n'),
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm('Hold.pdf', bytes),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function patchLegalHold(
  baseUrl: string,
  cookie: string,
  target: 'matters' | 'documents',
  id: string,
  legalHold: boolean,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/${target}/${id}/legal-hold`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ legalHold }),
  });
}

async function legalHoldAuditRows(targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'LEGAL_HOLD_CHANGED'
        ORDER BY created_at ASC
      `,
      [tenantAlphaId, targetId],
    );
    return result.rows;
  });
}

async function r12RecordsTablesProtectedCount(): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'retention_policies',
            'legal_holds',
            'records_archives',
            'disposal_requests',
            'disposal_certificates'
          )
          AND c.relrowsecurity
          AND c.relforcerowsecurity
      `,
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function storageUris(documentId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ storage_uri: string }>(
      `
        SELECT f.storage_uri
        FROM document_versions dv
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
      `,
      [tenantAlphaId, documentId],
    );
    return result.rows.map((row) => row.storage_uri);
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('legal-hold integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let alphaFirmAdminCookie: string;
  let alphaSecurityAdminCookie: string;
  let matterId: string;
  let documentId: string;

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
    alphaFirmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    alphaSecurityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });

    const clientId = await createClient(baseUrl, alphaOwnerCookie);
    matterId = await createMatter(baseUrl, alphaOwnerCookie, clientId);
    documentId = (await upload(baseUrl, alphaOwnerCookie, matterId)).documentId;
  });

  afterAll(async () => {
    const storage = createStorageService();
    if (documentId) {
      for (const storageUri of await storageUris(documentId)) {
        await storage.deleteByStorageUri(tenantAlphaId, storageUri);
      }
    }
    await app.close();
  });

  it('allows only legal-hold admins to change flags, audits changes, and protects R12 tables', async () => {
    const denied = await patchLegalHold(baseUrl, alphaOwnerCookie, 'matters', matterId, true);
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');

    const matterHold = await patchLegalHold(
      baseUrl,
      alphaFirmAdminCookie,
      'matters',
      matterId,
      true,
    );
    const matterHoldBody = await matterHold.text();
    expect(matterHold.status, matterHoldBody).toBe(200);
    expect((JSON.parse(matterHoldBody) as LegalHoldResponse).legalHold).toBe(true);

    const documentHold = await patchLegalHold(
      baseUrl,
      alphaSecurityAdminCookie,
      'documents',
      documentId,
      true,
    );
    const documentHoldBody = await documentHold.text();
    expect(documentHold.status, documentHoldBody).toBe(200);
    expect((JSON.parse(documentHoldBody) as LegalHoldResponse).legalHold).toBe(true);

    const addedWhileHeld = await fetch(`${baseUrl}/v1/documents/${documentId}/versions`, {
      method: 'POST',
      headers: { cookie: alphaOwnerCookie },
      body: versionForm('Held-Version.pdf', Buffer.from('%PDF-1.7\nHELD-VERSION\n')),
    });
    expect(addedWhileHeld.status, await addedWhileHeld.text()).toBe(201);

    const matterAudits = await legalHoldAuditRows(matterId);
    expect(matterAudits).toHaveLength(1);
    expect(matterAudits[0]?.metadata_json).toEqual({
      matter_id: matterId,
      before_ref: 'legal_hold:false',
      after_ref: 'legal_hold:true',
    });

    const documentAudits = await legalHoldAuditRows(documentId);
    expect(documentAudits).toHaveLength(1);
    expect(documentAudits[0]?.metadata_json).toEqual({
      document_id: documentId,
      matter_id: matterId,
      before_ref: 'legal_hold:false',
      after_ref: 'legal_hold:true',
    });
    expect(JSON.stringify([...matterAudits, ...documentAudits])).not.toContain('LEGAL-HOLD');
    await expect(r12RecordsTablesProtectedCount()).resolves.toBe(5);

    expect(() => assertDeletable({ documentLegalHold: true, matterLegalHold: false })).toThrow(
      LegalHoldBlockedError,
    );
    expect(() => assertDeletable({ documentLegalHold: false, matterLegalHold: true })).toThrow(
      LegalHoldBlockedError,
    );
  });
});
