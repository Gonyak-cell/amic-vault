import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DisposalCertificateDto,
  DisposalRequestDto,
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
import { NoopEncryptionHook } from '../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface DocumentFlags {
  status: string | null;
  legal_hold: boolean | null;
}

interface DisposalCounts {
  documents: number;
  versions: number;
  fileObjects: number;
  searchIndex: number;
  chunks: number;
  embeddings: number;
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

function uploadForm(title: string, filename: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.append('title', title);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
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

async function disposalCounts(documentId: string, fileObjectId: string): Promise<DisposalCounts> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      documents: string;
      versions: string;
      file_objects: string;
      search_index: string;
      chunks: string;
      embeddings: string;
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM documents WHERE tenant_id = $1 AND document_id = $2) AS documents,
          (SELECT count(*)::text FROM document_versions WHERE tenant_id = $1 AND document_id = $2) AS versions,
          (SELECT count(*)::text FROM file_objects WHERE tenant_id = $1 AND file_object_id = $3) AS file_objects,
          (SELECT count(*)::text FROM document_search_index WHERE tenant_id = $1 AND document_id = $2) AS search_index,
          (SELECT count(*)::text FROM document_chunks WHERE tenant_id = $1 AND document_id = $2) AS chunks,
          (SELECT count(*)::text FROM document_chunk_embeddings WHERE tenant_id = $1 AND document_id = $2) AS embeddings
      `,
      [tenantAlphaId, documentId, fileObjectId],
    );
    const row = result.rows[0];
    return {
      documents: Number(row?.documents ?? '0'),
      versions: Number(row?.versions ?? '0'),
      fileObjects: Number(row?.file_objects ?? '0'),
      searchIndex: Number(row?.search_index ?? '0'),
      chunks: Number(row?.chunks ?? '0'),
      embeddings: Number(row?.embeddings ?? '0'),
    };
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

async function recordsTableProtectionEvidence() {
  return withClient(createOwnerClient(), async (client) => {
    const tableNames = [
      'retention_policies',
      'legal_holds',
      'records_archives',
      'disposal_requests',
      'disposal_certificates',
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
    holdDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-HOLD`);
    disposalDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-DISPOSE`);
    referencedDocument = await upload(baseUrl, ownerCookie, matterId, `${marker}-REF`);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of [holdDocument?.documentId, referencedDocument?.documentId]) {
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

  it('archives and executes disposal only after approval, preserving a reference-only certificate', async () => {
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
    await expect(documentFlags(disposalDocument.documentId)).resolves.toMatchObject({
      status: 'disposal_locked',
    });

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

    const certificate = await postJson<DisposalCertificateDto>(
      baseUrl,
      firmAdminCookie,
      `/v1/records/disposals/${request.disposalRequestId}/execute`,
    );
    expect(certificate.disposalRequestId).toBe(request.disposalRequestId);
    expect(certificate.documentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(certificate.certificateHash).toMatch(/^[a-f0-9]{64}$/u);

    const getCertificate = await fetch(
      `${baseUrl}/v1/records/disposals/${request.disposalRequestId}/certificate`,
      {
        headers: { cookie: securityAdminCookie },
      },
    );
    expect(getCertificate.status, await getCertificate.text()).toBe(200);

    const getDeletedDocument = await fetch(`${baseUrl}/v1/documents/${disposalDocument.documentId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(getDeletedDocument.status, await getDeletedDocument.text()).toBe(404);

    await expect(
      disposalCounts(disposalDocument.documentId, disposalDocument.fileObjectId),
    ).resolves.toEqual({
      documents: 0,
      versions: 0,
      fileObjects: 0,
      searchIndex: 0,
      chunks: 0,
      embeddings: 0,
    });

    const executedAudit = await recordsAudit('DISPOSAL_EXECUTED', disposalDocument.documentId);
    const certificateAudit = await recordsAudit(
      'DISPOSAL_CERTIFICATE_CREATED',
      certificate.certificateId,
    );
    expect(executedAudit?.metadata_json).toMatchObject({
      disposal_request_id: request.disposalRequestId,
      certificate_id: certificate.certificateId,
      certificate_hash: certificate.certificateHash,
      document_id: disposalDocument.documentId,
      storage_object_count: 1,
      executor_user_id: certificate.executedBy,
    });
    expect(Number(executedAudit?.metadata_json.deleted_row_count ?? 0)).toBeGreaterThan(0);
    expect(certificateAudit?.metadata_json).toMatchObject({
      disposal_request_id: request.disposalRequestId,
      certificate_id: certificate.certificateId,
      certificate_hash: certificate.certificateHash,
    });
    expect(JSON.stringify([executedAudit, certificateAudit])).not.toContain('Should remain locked');
    expect(JSON.stringify([executedAudit, certificateAudit])).not.toContain('.pdf');
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
    ]);
    expect(evidence.destructive).toEqual([]);
  });
});
