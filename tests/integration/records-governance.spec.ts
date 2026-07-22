import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DisposalReviewListResponseDto,
  DisposalRequestDto,
  DmsWorkQueueResponseDto,
  ExternalLinkCreatedResponseDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
  LegalHoldDto,
  RecordsArchiveDto,
  RetentionPolicyDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { RetentionSchedulerService } from '../../apps/api/src/modules/records/retention-scheduler.service';
import { RecordsDisposalWorker } from '../../apps/api/src/modules/records/records-disposal.worker';
import { NoopEncryptionHook } from '../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface DocumentFlags {
  status: string | null;
  legal_hold: boolean | null;
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

async function createClient(baseUrl: string, cookie: string, marker: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Records Client ${marker}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  marker: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `REC-${marker}`,
      matterName: `Records Governance ${marker}`,
      matterType: 'litigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function addMatterMember(baseUrl: string, cookie: string, matterId: string, userId: string) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ userId, matterRole: 'member', accessLevel: 'edit' }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
}

function uploadForm(title: string, filename: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.append('title', title);
  const fileBytes = new Uint8Array(bytes);
  const filePart = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength,
  );
  form.append('file', new Blob([filePart], { type: 'application/pdf' }), filename);
  return form;
}

async function upload(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm(
      `Records Document ${marker}`,
      `Records-${marker}.pdf`,
      Buffer.from(`%PDF-1.7\nRECORDS-${marker}\n`),
    ),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function postJson<T>(
  baseUrl: string,
  cookie: string,
  path: string,
  body: Record<string, unknown> = {},
  expectedStatus = 201,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(expectedStatus);
  return JSON.parse(text) as T;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function documentFlags(documentId: string): Promise<DocumentFlags> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<DocumentFlags>(
      `
        SELECT status, legal_hold
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [tenantAlphaId, documentId],
    );
    return result.rows[0] ?? { status: null, legal_hold: null };
  });
}

async function storageUris(documentId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
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

async function recordsAudit(action: string, targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND (target_id = $3 OR metadata_json @> $4::jsonb)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, action, targetId, JSON.stringify({ document_id: targetId })],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function workQueue(baseUrl: string, cookie: string): Promise<DmsWorkQueueResponseDto> {
  const response = await fetch(`${baseUrl}/v1/work/items`, {
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as DmsWorkQueueResponseDto;
}

async function recordsWorkItemStatuses(disposalRequestId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ kind: string; status: string }>(
      `
        SELECT kind, status
        FROM work_items
        WHERE tenant_id = $1
          AND target_type = 'disposal_request'
          AND target_id = $2
        ORDER BY kind ASC
      `,
      [tenantAlphaId, disposalRequestId],
    );
    return result.rows;
  });
}

async function disposalReviewRows(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      disposal_request_id: string;
      status: string;
      reason_code: string;
      workflow_item_id: string | null;
    }>(
      `
        SELECT disposal_request_id::text AS disposal_request_id,
          status, reason_code, workflow_item_id::text AS workflow_item_id
        FROM disposal_requests
        WHERE tenant_id = $1
          AND document_id = $2
        ORDER BY created_at ASC, disposal_request_id ASC
      `,
      [tenantAlphaId, documentId],
    );
    return result.rows;
  });
}

async function ensureFreshMatterAppSyncState(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO matter_app_sync_state (
          tenant_id,
          source_ref,
          last_sync_at,
          reflected_count,
          drift_count,
          source_revision_hash,
          source_artifact_hash,
          run_id_hash,
          status,
          summary_json
        )
        VALUES (
          $1,
          'lawos_lazycodex_canonical_identity',
          now(),
          1,
          0,
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          'pass',
          '{"fixture":"records_governance_integration"}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref)
        DO UPDATE SET
          last_sync_at = EXCLUDED.last_sync_at,
          reflected_count = EXCLUDED.reflected_count,
          drift_count = EXCLUDED.drift_count,
          source_revision_hash = EXCLUDED.source_revision_hash,
          source_artifact_hash = EXCLUDED.source_artifact_hash,
          run_id_hash = EXCLUDED.run_id_hash,
          status = EXCLUDED.status,
          summary_json = EXCLUDED.summary_json,
          updated_at = now()
      `,
      [tenantAlphaId],
    );
  });
}

async function recordsTableProtectionEvidence() {
  return withClient(createOwnerClient(), async (client) => {
    const tableNames = [
      'retention_policies',
      'legal_holds',
      'records_archives',
      'disposal_requests',
      'disposal_certificates',
      'work_items',
    ];
    const rls = await client.query<{ table_name: string; rls: boolean; force_rls: boolean }>(
      `
        SELECT c.relname AS table_name, c.relrowsecurity AS rls,
          c.relforcerowsecurity AS force_rls
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname
      `,
      [tableNames],
    );
    const destructive = await client.query<{ table_name: string; privilege_type: string }>(
      `
        SELECT table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE grantee = 'vault_app'
          AND table_name = ANY($1::text[])
          AND privilege_type IN ('DELETE', 'TRUNCATE')
        ORDER BY table_name, privilege_type
      `,
      [tableNames],
    );
    return { rls: rls.rows, destructive: destructive.rows };
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('records governance integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let firmAdminCookie: string;
  let securityAdminCookie: string;
  let matterId: string;
  let holdDocument: UploadResponse;
  let disposalDocument: UploadResponse;
  let referencedDocument: UploadResponse;
  let retentionReviewDocument: UploadResponse | undefined;
  let retentionHeldDocument: UploadResponse | undefined;

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
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });

    const clientId = await createClient(baseUrl, ownerCookie, marker);
    matterId = await createMatter(baseUrl, ownerCookie, clientId, marker);
    await addMatterMember(baseUrl, ownerCookie, matterId, alphaFirmAdminUserId);
    await addMatterMember(baseUrl, ownerCookie, matterId, alphaSecurityAdminUserId);
    await ensureFreshMatterAppSyncState();
    holdDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-HOLD`);
    disposalDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-DISPOSE`);
    referencedDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-REF`);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of [
      holdDocument?.documentId,
      referencedDocument?.documentId,
      retentionReviewDocument?.documentId,
      retentionHeldDocument?.documentId,
    ]) {
      if (!documentId) continue;
      for (const storageUri of await storageUris(documentId)) {
        await storage.deleteByStorageUri(tenantAlphaId, storageUri);
      }
    }
    await app.close();
  });

  it('creates retention policy and legal hold records that block deletion and disposal', async () => {
    const policy = await postJson<RetentionPolicyDto>(
      baseUrl,
      securityAdminCookie,
      '/v1/records/retention-policies',
      {
        policyCode: `RET-${marker}`,
        label: `Retention ${marker}`,
        retentionDays: null,
      },
    );
    expect(policy.retentionDays).toBeNull();

    const hold = await postJson<LegalHoldDto>(
      baseUrl,
      securityAdminCookie,
      '/v1/records/legal-holds',
      {
        matterId,
        documentId: holdDocument.documentId,
        holdScope: 'document',
        reasonCode: 'CLIENT_RECORDS',
      },
    );
    expect(hold.status).toBe('active');
    expect(hold.createdBy).toBe(alphaSecurityAdminUserId);
    expect(hold.releasedBy).toBeNull();
    expect(hold.createdAt).toMatch(/T/u);
    await expect(documentFlags(holdDocument.documentId)).resolves.toMatchObject({
      legal_hold: true,
    });

    const directDelete = await fetch(`${baseUrl}/v1/documents/${holdDocument.documentId}`, {
      method: 'DELETE',
      headers: { cookie: ownerCookie },
    });
    expect(directDelete.status, await directDelete.text()).toBe(400);

    const disposalWhileHeld = await fetch(`${baseUrl}/v1/records/disposals`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: holdDocument.documentId,
        reasonCode: 'CLIENT_RECORDS',
      }),
    });
    const disposalWhileHeldBody = await disposalWhileHeld.text();
    expect(disposalWhileHeld.status, disposalWhileHeldBody).toBe(400);
    expect(disposalWhileHeldBody).toContain('DOCUMENT_LOCKED');

    const archiveWhileHeld = await fetch(`${baseUrl}/v1/records/archives`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: holdDocument.documentId,
        reasonCode: 'CLIENT_RECORDS',
      }),
    });
    const archiveWhileHeldBody = await archiveWhileHeld.text();
    expect(archiveWhileHeld.status, archiveWhileHeldBody).toBe(400);
    expect(archiveWhileHeldBody).toContain('DOCUMENT_LOCKED');

    const released = await postJson<LegalHoldDto>(
      baseUrl,
      securityAdminCookie,
      `/v1/records/legal-holds/${hold.legalHoldId}/release`,
    );
    expect(released.status).toBe('released');
    expect(released.createdBy).toBe(alphaSecurityAdminUserId);
    expect(released.releasedBy).toBe(alphaSecurityAdminUserId);
    expect(released.releasedAt).toMatch(/T/u);
    await expect(documentFlags(holdDocument.documentId)).resolves.toMatchObject({
      legal_hold: false,
    });

    const holdHistory = await fetch(`${baseUrl}/v1/records/legal-holds?matterId=${matterId}`, {
      headers: { cookie: securityAdminCookie },
    });
    const holdHistoryBody = await holdHistory.text();
    expect(holdHistory.status, holdHistoryBody).toBe(200);
    expect((JSON.parse(holdHistoryBody) as { holds: LegalHoldDto[] }).holds).toContainEqual(
      expect.objectContaining({
        legalHoldId: hold.legalHoldId,
        status: 'released',
        createdBy: alphaSecurityAdminUserId,
        releasedBy: alphaSecurityAdminUserId,
        documentId: holdDocument.documentId,
        matterId,
      }),
    );

    const policyAudit = await recordsAudit('RETENTION_POLICY_CHANGED', policy.retentionPolicyId);
    const holdAudit = await recordsAudit('LEGAL_HOLD_APPLIED', holdDocument.documentId);
    const releaseAudit = await recordsAudit('LEGAL_HOLD_RELEASED', holdDocument.documentId);
    expect(policyAudit?.metadata_json).toMatchObject({
      retention_policy_id: policy.retentionPolicyId,
      retention_days: null,
    });
    expect(holdAudit?.metadata_json).toMatchObject({
      legal_hold_id: hold.legalHoldId,
      document_id: holdDocument.documentId,
      reason_code: 'CLIENT_RECORDS',
    });
    expect(releaseAudit?.metadata_json).toMatchObject({
      legal_hold_id: hold.legalHoldId,
      document_id: holdDocument.documentId,
    });
    expect(JSON.stringify([policyAudit, holdAudit, releaseAudit])).not.toContain('RECORDS-');
    expect(JSON.stringify([policyAudit, holdAudit, releaseAudit])).not.toContain('.pdf');
  });

  it('schedules expired matter retention reviews without duplicating or including legal holds', async () => {
    const policy = await postJson<RetentionPolicyDto>(
      baseUrl,
      securityAdminCookie,
      '/v1/records/retention-policies',
      {
        policyCode: `RET-H8-${marker}`,
        label: `Retention H8 ${marker}`,
        retentionDays: 1,
      },
    );
    const clientId = await createClient(baseUrl, ownerCookie, `H8-${marker}`);
    const reviewMatterId = await createMatter(baseUrl, ownerCookie, clientId, `H8-${marker}`);
    await addMatterMember(baseUrl, ownerCookie, reviewMatterId, alphaFirmAdminUserId);
    await addMatterMember(baseUrl, ownerCookie, reviewMatterId, alphaSecurityAdminUserId);
    retentionReviewDocument = await upload(
      baseUrl,
      ownerCookie,
      reviewMatterId,
      `H8-${marker}-REVIEW`,
    );
    retentionHeldDocument = await upload(baseUrl, ownerCookie, reviewMatterId, `H8-${marker}-HELD`);

    const hold = await postJson<LegalHoldDto>(
      baseUrl,
      securityAdminCookie,
      '/v1/records/legal-holds',
      {
        matterId: reviewMatterId,
        documentId: retentionHeldDocument.documentId,
        holdScope: 'document',
        reasonCode: 'RETENTION_HOLD',
      },
    );
    expect(hold.status).toBe('active');

    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          UPDATE matters
          SET status = 'closed',
            opened_at = COALESCE(opened_at, '2025-12-31T00:00:00.000Z'::timestamptz),
            closed_at = '2026-01-01T00:00:00.000Z'::timestamptz,
            retention_policy_id = $3,
            updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
        `,
        [tenantAlphaId, reviewMatterId, policy.retentionPolicyId],
      );
    });

    const scheduler = app.get(RetentionSchedulerService);
    const scheduled = await scheduler.scheduleExpiredRetentionReviews({
      asOf: new Date('2026-01-03T00:00:00.000Z'),
      tenantIds: [tenantAlphaId],
    });
    expect(scheduled.scheduledCount).toBeGreaterThanOrEqual(1);

    const reviewRows = await disposalReviewRows(retentionReviewDocument.documentId);
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0]).toMatchObject({
      status: 'requested',
      reason_code: 'RETENTION_EXPIRED',
    });
    expect(reviewRows[0]?.workflow_item_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    await expect(disposalReviewRows(retentionHeldDocument.documentId)).resolves.toHaveLength(0);

    const pendingReviews = await fetch(`${baseUrl}/v1/records/disposals`, {
      headers: { cookie: securityAdminCookie },
    });
    const pendingReviewsBody = await pendingReviews.text();
    expect(pendingReviews.status, pendingReviewsBody).toBe(200);
    expect(JSON.parse(pendingReviewsBody) as DisposalReviewListResponseDto).toMatchObject({
      disposals: expect.arrayContaining([
        expect.objectContaining({
          disposalRequestId: reviewRows[0]?.disposal_request_id,
          documentTitle: `Records Document H8-${marker}-REVIEW`,
          matterName: `Records Governance H8-${marker}`,
          reasonCode: 'RETENTION_EXPIRED',
          reviewSource: 'retention_scheduler',
          status: 'requested',
        }),
      ]),
    });

    const approvalQueue = await workQueue(baseUrl, securityAdminCookie);
    expect(approvalQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'records',
          status: 'open',
          href: '/records?tab=disposal',
        }),
      ]),
    );
    await expect(
      recordsWorkItemStatuses(reviewRows[0]?.disposal_request_id ?? ''),
    ).resolves.toEqual([{ kind: 'records_disposal_approval', status: 'open' }]);
    const schedulerAudit = await recordsAudit(
      'RETENTION_REVIEW_SCHEDULED',
      retentionReviewDocument.documentId,
    );
    expect(schedulerAudit?.metadata_json).toMatchObject({
      disposal_request_id: reviewRows[0]?.disposal_request_id,
      document_id: retentionReviewDocument.documentId,
      matter_id: reviewMatterId,
      reason_code: 'RETENTION_EXPIRED',
      retention_days: 1,
      retention_policy_id: policy.retentionPolicyId,
    });
    expect(JSON.stringify(schedulerAudit)).not.toContain(`Records-H8-${marker}`);

    const rerun = await scheduler.scheduleExpiredRetentionReviews({
      asOf: new Date('2026-01-03T00:00:00.000Z'),
      tenantIds: [tenantAlphaId],
    });
    expect(rerun.scheduledCount).toBe(0);
    await expect(disposalReviewRows(retentionReviewDocument.documentId)).resolves.toHaveLength(1);
  });

  it('seals approval then exact-deletes only in the worker, retaining DB finalization for a later pack', async () => {
    const archive = await postJson<RecordsArchiveDto>(
      baseUrl,
      ownerCookie,
      '/v1/records/archives',
      {
        documentId: disposalDocument.documentId,
        reasonCode: 'CLIENT_RECORDS',
      },
    );
    expect(archive).toMatchObject({
      documentId: disposalDocument.documentId,
      archiveStatus: 'archived',
    });
    await expect(documentFlags(disposalDocument.documentId)).resolves.toMatchObject({
      status: 'archived',
    });

    const metadataPatch = await fetch(
      `${baseUrl}/v1/documents/${disposalDocument.documentId}/metadata`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Should remain locked' }),
      },
    );
    expect(metadataPatch.status, await metadataPatch.text()).toBe(400);

    const directDelete = await fetch(`${baseUrl}/v1/documents/${disposalDocument.documentId}`, {
      method: 'DELETE',
      headers: { cookie: ownerCookie },
    });
    expect(directDelete.status, await directDelete.text()).toBe(400);

    const request = await postJson<DisposalRequestDto>(
      baseUrl,
      ownerCookie,
      '/v1/records/disposals',
      {
        documentId: disposalDocument.documentId,
        reasonCode: 'CLIENT_RECORDS',
      },
    );
    expect(request.status).toBe('requested');
    expect(request.assignedRole).toBe('records_admin');
    expect(request.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    await expect(documentFlags(disposalDocument.documentId)).resolves.toMatchObject({
      status: 'disposal_locked',
    });

    const pendingReviews = await fetch(`${baseUrl}/v1/records/disposals`, {
      headers: { cookie: securityAdminCookie },
    });
    const pendingReviewsBody = await pendingReviews.text();
    expect(pendingReviews.status, pendingReviewsBody).toBe(200);
    expect(JSON.parse(pendingReviewsBody)).toMatchObject({
      disposals: expect.arrayContaining([
        expect.objectContaining({
          disposalRequestId: request.disposalRequestId,
          documentTitle: `Records Document ${marker}-DISPOSE`,
          matterName: `Records Governance ${marker}`,
          reasonCode: 'CLIENT_RECORDS',
          reviewSource: 'manual_request',
          status: 'requested',
        }),
      ]),
    });

    const approvalQueue = await workQueue(baseUrl, securityAdminCookie);
    expect(approvalQueue.source).toBe('persisted_work_items');
    expect(approvalQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'records',
          title: '삭제 승인 요청',
          status: 'open',
          dueAt: request.dueAt,
          href: '/records?tab=disposal',
        }),
      ]),
    );
    expect(JSON.stringify(approvalQueue)).not.toContain(disposalDocument.documentId);

    const prematureExecute = await fetch(
      `${baseUrl}/v1/records/disposals/${request.disposalRequestId}/execute`,
      {
        method: 'POST',
        headers: { cookie: firmAdminCookie },
      },
    );
    expect(prematureExecute.status, await prematureExecute.text()).toBe(400);

    const approved = await postJson<DisposalRequestDto>(
      baseUrl,
      securityAdminCookie,
      `/v1/records/disposals/${request.disposalRequestId}/approve`,
    );
    expect(approved.status).toBe('approved');
    expect(approved.assignedRole).toBe('records_admin');
    expect(approved.pendingExecutionRef).toMatch(/^[0-9a-f-]{36}$/u);

    const executionQueue = await workQueue(baseUrl, firmAdminCookie);
    expect(executionQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'records',
          title: '삭제 실행 대기',
          status: 'open',
          dueAt: approved.dueAt,
        }),
      ]),
    );

    const apiExecute = await fetch(
      `${baseUrl}/v1/records/disposals/${request.disposalRequestId}/execute`,
      { method: 'POST', headers: { cookie: firmAdminCookie } },
    );
    expect(apiExecute.status, await apiExecute.text()).toBe(400);
    const worker = app.get(RecordsDisposalWorker);
    await expect(worker.runOnceForTenant(tenantAlphaId)).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      deadLetterCount: 0,
    });

    await expect(recordsWorkItemStatuses(request.disposalRequestId)).resolves.toEqual([
      { kind: 'records_disposal_approval', status: 'completed' },
      { kind: 'records_disposal_execution', status: 'open' },
    ]);

    const getCertificate = await fetch(
      `${baseUrl}/v1/records/disposals/${request.disposalRequestId}/certificate`,
      {
        headers: { cookie: securityAdminCookie },
      },
    );
    expect(getCertificate.status, await getCertificate.text()).toBe(404);

    const getDocument = await fetch(
      `${baseUrl}/v1/documents/${disposalDocument.documentId}`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    expect(getDocument.status, await getDocument.text()).toBe(200);
    await expect(documentFlags(disposalDocument.documentId)).resolves.toMatchObject({
      status: 'disposal_locked',
    });

    const executedAudit = await recordsAudit('DISPOSAL_EXECUTED', approved.pendingExecutionRef ?? '');
    expect(executedAudit?.metadata_json).toMatchObject({
      disposal_request_id: request.disposalRequestId,
      document_id: disposalDocument.documentId,
      evidence_id: approved.pendingExecutionRef,
      item_count: 1,
      status_after: 'completed',
    });
    expect(JSON.stringify(executedAudit)).not.toContain('Should remain locked');
    expect(JSON.stringify(executedAudit)).not.toContain('.pdf');
  });

  it('blocks referenced disposal and keeps records tables RLS protected', async () => {
    const workspace = await postJson<ExternalWorkspaceDto>(
      baseUrl,
      ownerCookie,
      '/v1/external/workspaces',
      {
        matterId,
        workspaceCode: `REC-${marker}`,
        displayRef: `Records room ${marker}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    );
    const externalUser = await postJson<ExternalUserDto>(
      baseUrl,
      ownerCookie,
      '/v1/external/users',
      {
        workspaceId: workspace.workspaceId,
        emailHash: sha256Hex(`records-${marker}@example.test`),
        displayRef: `records ${marker}`,
      },
    );
    const link = await postJson<ExternalLinkCreatedResponseDto>(
      baseUrl,
      ownerCookie,
      '/v1/external/links',
      {
        workspaceId: workspace.workspaceId,
        externalUserId: externalUser.externalUserId,
        documentId: referencedDocument.documentId,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        ndaVersion: 'NDA-R11-V1',
        watermarkRequired: true,
      },
    );
    expect(link.link.documentId).toBe(referencedDocument.documentId);

    const blocked = await fetch(`${baseUrl}/v1/records/disposals`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: referencedDocument.documentId,
        reasonCode: 'CLIENT_RECORDS',
      }),
    });
    const blockedText = await blocked.text();
    expect(blocked.status, blockedText).toBe(400);
    expect(blockedText).toContain('VALIDATION_FAILED');
    await expect(documentFlags(referencedDocument.documentId)).resolves.toMatchObject({
      status: 'draft',
    });

    const evidence = await recordsTableProtectionEvidence();
    expect(evidence.rls).toEqual([
      { table_name: 'disposal_certificates', rls: true, force_rls: true },
      { table_name: 'disposal_requests', rls: true, force_rls: true },
      { table_name: 'legal_holds', rls: true, force_rls: true },
      { table_name: 'records_archives', rls: true, force_rls: true },
      { table_name: 'retention_policies', rls: true, force_rls: true },
      { table_name: 'work_items', rls: true, force_rls: true },
    ]);
    expect(evidence.destructive).toEqual([]);
  });
});
