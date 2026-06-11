import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createOpaqueToken,
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
} from '../../../apps/api/src/modules/auth/session.repository';
import { PermissionService } from '../../../apps/api/src/modules/permission/permission.service';
import { NoopEncryptionHook } from '../../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';

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
    body: JSON.stringify({ name: `Upload Permission Client ${randomUUID()}` }),
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
      matterCode: `UPERM-${randomUUID()}`,
      matterName: `Upload Permission ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function addMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  input: {
    userId: string;
    matterRole: 'member' | 'limited_reviewer';
    accessLevel: 'read' | 'edit';
  },
) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  expect(response.status, await response.text()).toBe(201);
}

async function updateStatus(baseUrl: string, cookie: string, matterId: string, status: string) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  expect(response.status, await response.text()).toBe(200);
}

async function closeMatter(baseUrl: string, cookie: string, matterId: string): Promise<void> {
  for (const status of ['open', 'active', 'closing', 'closed']) {
    await updateStatus(baseUrl, cookie, matterId, status);
  }
}

function uploadForm(marker: string): FormData {
  const bytes = Buffer.from(`%PDF-1.7\nFIXMARK-DOC-${marker}\n`);
  const form = new FormData();
  form.append('title', `Permission ${marker}`);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), `${marker}.pdf`);
  return form;
}

async function upload(baseUrl: string, cookie: string, matterId: string, marker: string) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm(marker),
  });
}

async function uploadedRow(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ storage_uri: string }>(
      `
        SELECT f.storage_uri
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

async function insertExplicitUploadCondition(matterId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, condition_json, created_by
        )
        VALUES ($1, 'user', $2, 'matter', $3, 'upload', 'ALLOW', $4::jsonb, $5)
      `,
      [
        tenantAlphaId,
        alphaOwnerUserId,
        matterId,
        JSON.stringify({ unsupported: true }),
        alphaOwnerUserId,
      ],
    );
  });
}

async function createExternalUserSession(matterId: string): Promise<string> {
  const token = createOpaqueToken();
  const userId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO users (
          user_id, tenant_id, email, name, role, practice_group, status, password_hash
        )
        VALUES ($1, $2, $3, 'External Upload User', 'external_user', 'external', 'active', 'manual-session-only')
      `,
      [userId, tenantAlphaId, `external-upload-${userId}@test.local`],
    );
    await client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, 'member', 'edit', $4)
      `,
      [tenantAlphaId, matterId, userId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, now() + interval '1 hour')
      `,
      [tenantAlphaId, userId, hashOpaqueToken(token)],
    );
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('document upload permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let securityAdminCookie: string;
  let clientId: string;
  const createdStorageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of createdStorageUris) {
      await storage.deleteByStorageUri(tenantAlphaId, storageUri);
    }
    await app.close();
  });

  it('allows an owner upload through the normal permission path', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const response = await upload(baseUrl, ownerCookie, matterId, 'ALLOW');
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const uploaded = JSON.parse(body) as { documentId: string };
    const row = await uploadedRow(uploaded.documentId);
    expect(row?.storage_uri).toContain(`/tenants/${tenantAlphaId}/matters/${matterId}/documents/`);
    if (row?.storage_uri) createdStorageUris.push(row.storage_uri);
  });

  it('blocks nonmember, limited reviewer, and external user uploads', async () => {
    const nonmemberMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const nonmember = await upload(baseUrl, memberCookie, nonmemberMatterId, 'NONMEMBER');
    const nonmemberBody = await nonmember.text();
    expect(nonmember.status, nonmemberBody).toBe(403);
    expect(nonmemberBody).toContain('PERMISSION_DENIED');

    const limitedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMember(baseUrl, ownerCookie, limitedMatterId, {
      userId: alphaMemberUserId,
      matterRole: 'limited_reviewer',
      accessLevel: 'read',
    });
    const limited = await upload(baseUrl, memberCookie, limitedMatterId, 'LIMITED');
    const limitedBody = await limited.text();
    expect(limited.status, limitedBody).toBe(403);
    expect(limitedBody).toContain('PERMISSION_DENIED');

    const externalMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const externalCookie = await createExternalUserSession(externalMatterId);
    const external = await upload(baseUrl, externalCookie, externalMatterId, 'EXTERNAL');
    const externalBody = await external.text();
    expect(external.status, externalBody).toBe(403);
    expect(externalBody).toContain('PERMISSION_DENIED');
  });

  it('blocks wall-excluded and closed or archived matter uploads', async () => {
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `Upload Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaOwnerUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(createWall.status, await createWall.text()).toBe(201);
    const wallDenied = await upload(baseUrl, ownerCookie, wallMatterId, 'WALL');
    const wallDeniedBody = await wallDenied.text();
    expect(wallDenied.status, wallDeniedBody).toBe(403);
    expect(wallDeniedBody).toContain('ETHICAL_WALL_BLOCKED');

    const closedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await closeMatter(baseUrl, ownerCookie, closedMatterId);
    const closed = await upload(baseUrl, ownerCookie, closedMatterId, 'CLOSED');
    const closedBody = await closed.text();
    expect(closed.status, closedBody).toBe(403);
    expect(closedBody).toContain('PERMISSION_DENIED');

    await updateStatus(baseUrl, ownerCookie, closedMatterId, 'archived');
    const archived = await upload(baseUrl, ownerCookie, closedMatterId, 'ARCHIVED');
    const archivedBody = await archived.text();
    expect(archived.status, archivedBody).toBe(403);
    expect(archivedBody).toContain('PERMISSION_DENIED');
  });

  it('fails closed when permission evaluation throws or cannot interpret policy conditions', async () => {
    const permissionService = app.get(PermissionService);
    const spy = vi
      .spyOn(permissionService, 'canUploadToMatter')
      .mockRejectedValueOnce(new Error('forced permission failure'));
    const thrownMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const thrown = await upload(baseUrl, ownerCookie, thrownMatterId, 'THROWN');
    const thrownBody = await thrown.text();
    expect(thrown.status, thrownBody).toBe(403);
    expect(thrownBody).toContain('PERMISSION_DENIED');
    spy.mockRestore();

    const conditionMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await insertExplicitUploadCondition(conditionMatterId);
    const unparsed = await upload(baseUrl, ownerCookie, conditionMatterId, 'CONDITION');
    const unparsedBody = await unparsed.text();
    expect(unparsed.status, unparsedBody).toBe(403);
    expect(unparsedBody).toContain('PERMISSION_DENIED');
  });
});
