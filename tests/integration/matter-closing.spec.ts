import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

type MatterClosingChecklistItemCode =
  | 'execution_copy_designated'
  | 'official_final_version'
  | 'legal_hold_clear'
  | 'external_links_clear'
  | 'issues_resolved';

interface MatterClosingChecklistDto {
  matterId: string;
  complete: boolean;
  items: {
    itemCode: MatterClosingChecklistItemCode;
    status: 'pending' | 'passed' | 'waived';
  }[];
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function expectJson<T>(response: Response, status: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(status);
  return JSON.parse(body) as T;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `A11 Closing Client ${randomUUID()}` }),
  });
  return (await expectJson<{ clientId: string }>(response, 201)).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `A11-${randomUUID()}`,
      matterName: `A11 Closing ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  return (await expectJson<{ matterId: string }>(response, 201)).matterId;
}

async function updateStatus(
  baseUrl: string,
  cookie: string,
  matterId: string,
  status: string,
): Promise<Response> {
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
): Promise<{ conflictCheckId: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks`, {
    method: 'POST',
    headers: { cookie },
  });
  return expectJson<{ conflictCheckId: string }>(response, 201);
}

async function clearMatterConflicts(baseUrl: string, cookie: string, matterId: string): Promise<void> {
  const check = await runConflictCheck(baseUrl, cookie, matterId);
  const response = await fetch(
    `${baseUrl}/v1/matters/${matterId}/conflict-checks/${check.conflictCheckId}`,
    {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cleared', rationale: 'A11 closing gate fixture' }),
    },
  );
  await expectJson(response, 200);
}

async function createActiveMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
): Promise<string> {
  const matterId = await createMatter(baseUrl, cookie, clientId);
  await clearMatterConflicts(baseUrl, cookie, matterId);
  await insertClosingReadyDocument(matterId);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'open'), 200);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'active'), 200);
  return matterId;
}

async function getChecklist(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<MatterClosingChecklistDto> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/closing-checklist`, {
    headers: { cookie },
  });
  return expectJson<MatterClosingChecklistDto>(response, 200);
}

async function evaluateChecklist(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<MatterClosingChecklistDto> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/closing-checklist/evaluate`, {
    method: 'POST',
    headers: { cookie },
  });
  return expectJson<MatterClosingChecklistDto>(response, 201);
}

function itemStatus(
  checklist: MatterClosingChecklistDto,
  itemCode: MatterClosingChecklistItemCode,
): string | undefined {
  return checklist.items.find((item) => item.itemCode === itemCode)?.status;
}

async function insertClosingReadyDocument(
  matterId: string,
): Promise<{ documentId: string; versionId: string }> {
  const documentId = randomUUID();
  const fileObjectId = randomUUID();
  const versionId = randomUUID();
  const hash = sha256Hex(`a11-document:${documentId}`);
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        VALUES ($1, $2, $3, 'a11-closing.pdf', 'a11-closing.pdf', 'application/pdf', 32, $4, $5)
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
          $1, $2, $3, $4, 'A11 Closing Document', 'final',
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
      [versionId, tenantAlphaId, documentId, fileObjectId, hash, alphaOwnerUserId],
    );
  });
  return { documentId, versionId };
}

async function insertLegalHold(matterId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO legal_holds (tenant_id, matter_id, hold_scope, status, reason_code, created_by)
        VALUES ($1, $2, 'matter', 'active', 'A11_CLOSE_HOLD', $3)
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
  });
}

async function releaseLegalHold(matterId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE legal_holds
        SET status = 'released', released_by = $3, released_at = now(), updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status = 'active'
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
  });
}

async function insertMatterIssue(matterId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO matter_issues (
          tenant_id, matter_id, title, summary, status, risk_level, created_by, updated_by
        )
        VALUES ($1, $2, 'A11 open issue', 'Closing gate fixture issue.', 'open', 'medium', $3, $3)
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
  });
}

async function insertActiveExternalLink(
  matterId: string,
  documentId: string,
  versionId: string,
): Promise<void> {
  const workspaceId = randomUUID();
  const externalUserId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO external_workspaces (
          workspace_id, tenant_id, matter_id, workspace_code, display_ref, status,
          expires_at, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, 'A11 Closing Workspace', 'active', now() + interval '7 days', $5, $5)
      `,
      [
        workspaceId,
        tenantAlphaId,
        matterId,
        `A11_${workspaceId.replace(/-/gu, '').slice(0, 12).toUpperCase()}`,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO external_users (
          external_user_id, tenant_id, email_hash, display_ref, status, created_by, updated_by
        )
        VALUES ($1, $2, $3, 'A11 External User', 'active', $4, $4)
      `,
      [externalUserId, tenantAlphaId, sha256Hex(`external:${externalUserId}`), alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO external_workspace_members (
          tenant_id, workspace_id, external_user_id, status, created_by
        )
        VALUES ($1, $2, $3, 'active', $4)
      `,
      [tenantAlphaId, workspaceId, externalUserId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO external_secure_links (
          tenant_id, workspace_id, external_user_id, document_id, version_id, token_hash, status,
          expires_at, access_count, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', now() + interval '7 days', 0, $7)
      `,
      [
        tenantAlphaId,
        workspaceId,
        externalUserId,
        documentId,
        versionId,
        sha256Hex(`a11-token:${workspaceId}`),
        alphaOwnerUserId,
      ],
    );
  });
}

async function closingDenials(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'ACCESS_DENIED'
          AND result = 'denied'
          AND metadata_json->>'reason_code' = 'CLOSING_CHECKLIST_INCOMPLETE'
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

async function waiverAudits(matterId: string, itemCode: MatterClosingChecklistItemCode) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'MATTER_CLOSING_CHECKLIST_WAIVED'
          AND metadata_json->>'item_code' = $3
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId, itemCode],
    );
    return result.rows;
  });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function storageUri(matterId: string, documentId: string, fileObjectId: string): string {
  return `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
}

describe('matter closing checklist integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
    clientId = await createClient(baseUrl, cookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates the checklist when an active Matter enters closing', async () => {
    const matterId = await createActiveMatter(baseUrl, cookie, clientId);

    await expectJson(await updateStatus(baseUrl, cookie, matterId, 'closing'), 200);
    const checklist = await getChecklist(baseUrl, cookie, matterId);

    expect(checklist.items).toHaveLength(5);
    expect(checklist.complete).toBe(true);
    expect(itemStatus(checklist, 'execution_copy_designated')).toBe('passed');
    expect(itemStatus(checklist, 'official_final_version')).toBe('passed');
  });

  it('blocks closed while an active legal hold remains, then closes after release and reevaluate', async () => {
    const matterId = await createActiveMatter(baseUrl, cookie, clientId);
    await insertLegalHold(matterId);
    await expectJson(await updateStatus(baseUrl, cookie, matterId, 'closing'), 200);

    const heldChecklist = await getChecklist(baseUrl, cookie, matterId);
    expect(itemStatus(heldChecklist, 'legal_hold_clear')).toBe('pending');

    const blocked = await updateStatus(baseUrl, cookie, matterId, 'closed');
    const blockedBody = await blocked.text();
    expect(blocked.status, blockedBody).toBe(422);
    expect(blockedBody).toContain('CLOSING_CHECKLIST_INCOMPLETE');
    expect((await closingDenials(matterId))[0]?.metadata_json).toEqual(
      expect.objectContaining({
        blocked_reason: 'closing_checklist:incomplete',
        reason_code: 'CLOSING_CHECKLIST_INCOMPLETE',
      }),
    );

    await releaseLegalHold(matterId);
    const clearChecklist = await evaluateChecklist(baseUrl, cookie, matterId);
    expect(itemStatus(clearChecklist, 'legal_hold_clear')).toBe('passed');

    const closed = await expectJson<{ status: string; closedAt: string | null }>(
      await updateStatus(baseUrl, cookie, matterId, 'closed'),
      200,
    );
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toEqual(expect.any(String));
  });

  it('requires waiver reasons, audits waiver, and keeps active external links pending', async () => {
    const waiverMatterId = await createActiveMatter(baseUrl, cookie, clientId);
    await insertMatterIssue(waiverMatterId);
    await expectJson(await updateStatus(baseUrl, cookie, waiverMatterId, 'closing'), 200);

    const missingReason = await fetch(
      `${baseUrl}/v1/matters/${waiverMatterId}/closing-checklist/issues_resolved/waive`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: '' }),
      },
    );
    expect(missingReason.status, await missingReason.text()).toBe(400);

    const waived = await fetch(
      `${baseUrl}/v1/matters/${waiverMatterId}/closing-checklist/issues_resolved/waive`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: '운영자 승인된 종료 예외 처리' }),
      },
    );
    const waiverChecklist = await expectJson<MatterClosingChecklistDto>(waived, 201);
    expect(itemStatus(waiverChecklist, 'issues_resolved')).toBe('waived');
    expect((await waiverAudits(waiverMatterId, 'issues_resolved'))[0]?.metadata_json).toEqual(
      expect.objectContaining({
        evidence_ref: 'waiver:issues_resolved',
        item_code: 'issues_resolved',
        reason_code: 'waived_by_authorized_user',
      }),
    );

    const externalMatterId = await createActiveMatter(baseUrl, cookie, clientId);
    const document = await insertClosingReadyDocument(externalMatterId);
    await insertActiveExternalLink(externalMatterId, document.documentId, document.versionId);
    await expectJson(await updateStatus(baseUrl, cookie, externalMatterId, 'closing'), 200);

    const externalChecklist = await getChecklist(baseUrl, cookie, externalMatterId);
    expect(itemStatus(externalChecklist, 'external_links_clear')).toBe('pending');

    const blocked = await updateStatus(baseUrl, cookie, externalMatterId, 'closed');
    const blockedBody = await blocked.text();
    expect(blocked.status, blockedBody).toBe(422);
    expect(blockedBody).toContain('CLOSING_CHECKLIST_INCOMPLETE');
  });
});
