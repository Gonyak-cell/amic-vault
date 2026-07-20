import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

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
    body: JSON.stringify({ name: `Matter Lifecycle Client ${randomUUID()}` }),
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
      matterCode: `ML-${randomUUID()}`,
      matterName: `Matter Lifecycle ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function updateStatus(baseUrl: string, cookie: string, matterId: string, status: string) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function runConflictCheck(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<{ conflictCheckId: string; status: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks`, {
    method: 'POST',
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as { conflictCheckId: string; status: string };
}

async function resolveConflictCheck(
  baseUrl: string,
  cookie: string,
  matterId: string,
  conflictCheckId: string,
  status: 'cleared' | 'blocked',
) {
  const response = await fetch(
    `${baseUrl}/v1/matters/${matterId}/conflict-checks/${conflictCheckId}`,
    {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        status,
        rationale: status === 'cleared' ? '내부 이해상충 검토 완료' : '정보 차단 검토 필요',
      }),
    },
  );
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as { status: string };
}

async function clearMatterConflicts(baseUrl: string, cookie: string, matterId: string): Promise<void> {
  const check = await runConflictCheck(baseUrl, cookie, matterId);
  await resolveConflictCheck(baseUrl, cookie, matterId, check.conflictCheckId, 'cleared');
}

async function addMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  userId = alphaMemberUserId,
) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      matterRole: 'member',
      accessLevel: 'read',
    }),
  });
}

async function insertClosingReadyDocument(matterId: string): Promise<void> {
  const documentId = randomUUID();
  const fileObjectId = randomUUID();
  const hash = sha256Hex(`closing-ready:${documentId}`);
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        VALUES ($1, $2, $3, 'closing-ready.pdf', 'closing-ready.pdf', 'application/pdf', 32, $4, $5)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        storageUri(matterId, documentId, fileObjectId),
        hash,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, confidentiality_level, privilege_status, ai_allowed, created_by, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'Closing Ready Document', 'final',
          'memo', 'standard', 'none', true, $5, now()
        )
      `,
      [documentId, tenantAlphaId, matterId, randomUUID(), alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO document_versions (
          version_id, tenant_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, version_label, version_significance
        )
        VALUES ($1, $2, $3, 1, 'current', $4, $5, $6, 'Execution', 'execution_copy')
      `,
      [randomUUID(), tenantAlphaId, documentId, fileObjectId, hash, alphaOwnerUserId],
    );
  });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function storageUri(matterId: string, documentId: string, fileObjectId: string): string {
  return `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
}

async function transitionAudits(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'MATTER_STATUS_CHANGED'
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows.map((row) => row.metadata_json);
  });
}

async function conflictTransitionDenials(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
      result: string;
    }>(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'ACCESS_DENIED'
          AND result = 'denied'
          AND metadata_json->>'reason_code' = 'CONFLICTS_NOT_CLEARED'
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

async function insertInvalidStatus(clientId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await expect(
      client.query(
        `
          INSERT INTO matters (
            tenant_id, client_id, matter_code, matter_name, matter_type, status, created_by
          )
          VALUES ($1, $2, $3, 'Invalid Status Matter', 'contract', 'deleted', $4)
        `,
        [tenantAlphaId, clientId, `BADSTATUS-${randomUUID()}`, alphaOwnerUserId],
      ),
    ).rejects.toThrow(/matters_status_check/);
  });
}

describe('matter lifecycle integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
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
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the R1 lifecycle transitions with timestamps and audit', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    await clearMatterConflicts(baseUrl, ownerCookie, matterId);
    await insertClosingReadyDocument(matterId);

    const opened = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    const openedBody = await opened.text();
    expect(opened.status, openedBody).toBe(200);
    expect(JSON.parse(openedBody)).toMatchObject({ status: 'open' });
    expect((JSON.parse(openedBody) as { openedAt: string | null }).openedAt).toEqual(
      expect.any(String),
    );

    for (const status of ['active', 'closing', 'closed', 'archived']) {
      const response = await updateStatus(baseUrl, ownerCookie, matterId, status);
      const body = await response.text();
      expect(response.status, body).toBe(200);
      expect(JSON.parse(body)).toMatchObject({ status });
      if (status === 'closed') {
        expect((JSON.parse(body) as { closedAt: string | null }).closedAt).toEqual(
          expect.any(String),
        );
      }
    }

    const audits = await transitionAudits(matterId);
    expect(audits).toEqual([
      expect.objectContaining({ before_ref: 'status:proposed', after_ref: 'status:open' }),
      expect.objectContaining({ before_ref: 'status:open', after_ref: 'status:active' }),
      expect.objectContaining({ before_ref: 'status:active', after_ref: 'status:closing' }),
      expect.objectContaining({ before_ref: 'status:closing', after_ref: 'status:closed' }),
      expect.objectContaining({ before_ref: 'status:closed', after_ref: 'status:archived' }),
    ]);
  });

  it('fails closed for invalid transitions and non-owner status changes', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const add = await addMember(baseUrl, ownerCookie, matterId);
    expect(add.status, await add.text()).toBe(201);

    const noOp = await updateStatus(baseUrl, ownerCookie, matterId, 'proposed');
    expect(noOp.status, await noOp.text()).toBe(400);

    const directClose = await updateStatus(baseUrl, ownerCookie, matterId, 'closed');
    expect(directClose.status, await directClose.text()).toBe(400);

    const memberDenied = await updateStatus(baseUrl, memberCookie, matterId, 'open');
    expect(memberDenied.status, await memberDenied.text()).toBe(403);

    const adminDenied = await updateStatus(baseUrl, firmAdminCookie, matterId, 'open');
    expect(adminDenied.status, await adminDenied.text()).toBe(403);

    await clearMatterConflicts(baseUrl, ownerCookie, matterId);
    const ownerAllowed = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    expect(ownerAllowed.status, await ownerAllowed.text()).toBe(200);

    await insertInvalidStatus(clientId);
  });

  it('gates proposed to open on cleared conflict checks and audits denied transitions', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);

    const notStartedOpen = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    const notStartedBody = await notStartedOpen.text();
    expect(notStartedOpen.status, notStartedBody).toBe(422);
    expect(notStartedBody).toContain('CONFLICTS_NOT_CLEARED');

    const check = await runConflictCheck(baseUrl, ownerCookie, matterId);
    expect(check.status).toBe('in_review');

    const inReviewOpen = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    const inReviewBody = await inReviewOpen.text();
    expect(inReviewOpen.status, inReviewBody).toBe(422);
    expect(inReviewBody).toContain('CONFLICTS_NOT_CLEARED');

    const denials = await conflictTransitionDenials(matterId);
    expect(denials).toHaveLength(2);
    expect(denials[0]?.metadata_json).toEqual(
      expect.objectContaining({
        before_ref: 'status:proposed',
        after_ref: 'status:open',
        blocked_reason: 'conflicts_status:not_started',
        reason_code: 'CONFLICTS_NOT_CLEARED',
      }),
    );
    expect(denials[1]?.metadata_json).toEqual(
      expect.objectContaining({
        blocked_reason: 'conflicts_status:in_review',
        reason_code: 'CONFLICTS_NOT_CLEARED',
      }),
    );

    await resolveConflictCheck(baseUrl, ownerCookie, matterId, check.conflictCheckId, 'cleared');
    const clearedOpen = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    const clearedBody = await clearedOpen.text();
    expect(clearedOpen.status, clearedBody).toBe(200);
    expect(JSON.parse(clearedBody)).toMatchObject({
      status: 'open',
      conflictsStatus: 'cleared',
    });

    const blockedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const blockedCheck = await runConflictCheck(baseUrl, ownerCookie, blockedMatterId);
    await resolveConflictCheck(
      baseUrl,
      ownerCookie,
      blockedMatterId,
      blockedCheck.conflictCheckId,
      'blocked',
    );

    const blockedOpen = await updateStatus(baseUrl, ownerCookie, blockedMatterId, 'open');
    const blockedBody = await blockedOpen.text();
    expect(blockedOpen.status, blockedBody).toBe(422);
    expect(blockedBody).toContain('CONFLICTS_NOT_CLEARED');

    const blockedDenials = await conflictTransitionDenials(blockedMatterId);
    expect(blockedDenials).toHaveLength(1);
    expect(blockedDenials[0]?.metadata_json).toEqual(
      expect.objectContaining({
        blocked_reason: 'conflicts_status:blocked',
        reason_code: 'CONFLICTS_NOT_CLEARED',
      }),
    );
  });

  it('blocks closed and archived matter member mutations after authorization', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const addBeforeClose = await addMember(baseUrl, ownerCookie, matterId);
    expect(addBeforeClose.status, await addBeforeClose.text()).toBe(201);

    await clearMatterConflicts(baseUrl, ownerCookie, matterId);
    await insertClosingReadyDocument(matterId);
    for (const status of ['open', 'active', 'closing', 'closed']) {
      const response = await updateStatus(baseUrl, ownerCookie, matterId, status);
      expect(response.status, await response.text()).toBe(200);
    }

    const addClosed = await addMember(baseUrl, ownerCookie, matterId, alphaFirmAdminUserId);
    const addClosedBody = await addClosed.text();
    expect(addClosed.status, addClosedBody).toBe(400);
    expect(addClosedBody).toContain('MATTER_CLOSED');

    const roleClosed = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaMemberUserId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'edit' }),
      },
    );
    const roleClosedBody = await roleClosed.text();
    expect(roleClosed.status, roleClosedBody).toBe(400);
    expect(roleClosedBody).toContain('MATTER_CLOSED');

    const updateClosed = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterName: `Closed Matter Rename ${randomUUID()}` }),
    });
    const updateClosedBody = await updateClosed.text();
    expect(updateClosed.status, updateClosedBody).toBe(400);
    expect(updateClosedBody).toContain('MATTER_CLOSED');

    const archive = await updateStatus(baseUrl, ownerCookie, matterId, 'archived');
    expect(archive.status, await archive.text()).toBe(200);

    const addArchived = await addMember(baseUrl, ownerCookie, matterId, alphaFirmAdminUserId);
    const addArchivedBody = await addArchived.text();
    expect(addArchived.status, addArchivedBody).toBe(400);
    expect(addArchivedBody).toContain('MATTER_CLOSED');
  });
});
