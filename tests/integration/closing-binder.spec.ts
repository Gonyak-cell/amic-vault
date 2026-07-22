import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';
import { createStorageService, markPromotedFixture } from './document-access/document-api-helpers';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface ClosingBinderResponseDto {
  matterId: string;
  binder: {
    closingBinderId: string;
    matterId: string;
    status: 'draft' | 'finalized';
    manifestSha256: string;
    recordsArchiveCount: number;
    finalizedAt: string | null;
    manifest: {
      items: Array<{
        itemId: string;
        itemType: 'execution_copy' | 'final_version' | 'key_email';
        title: string;
        sha256: string;
        documentId: string | null;
        versionId: string | null;
        versionLabel: string | null;
        emailId: string | null;
      }>;
    };
  } | null;
}

interface SeededDocument {
  documentId: string;
  hash: string;
  title: string;
  versionId: string;
  body: string;
}

async function login(
  baseUrl: string,
  input: { email: string; password: string; tenantId: string },
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

async function expectJson<T>(response: Response, status: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(status);
  return JSON.parse(body) as T;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `A12 Closing Binder Client ${randomUUID()}` }),
  });
  return (await expectJson<{ clientId: string }>(response, 201)).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `A12-${randomUUID()}`,
      matterName: `A12 Closing Binder ${randomUUID()}`,
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
      body: JSON.stringify({ status: 'cleared', rationale: 'A12 closing binder fixture' }),
    },
  );
  await expectJson(response, 200);
}

async function createActiveMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const matterId = await createMatter(baseUrl, cookie, clientId);
  await clearMatterConflicts(baseUrl, cookie, matterId);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'open'), 200);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'active'), 200);
  return matterId;
}

async function getBinder(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<ClosingBinderResponseDto> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/closing-binder`, {
    headers: { cookie },
  });
  return expectJson<ClosingBinderResponseDto>(response, 200);
}

async function insertBinderDocument(
  matterId: string,
  input: { label: string; status: 'executed' | 'final'; significance: 'execution_copy' | 'final' },
): Promise<SeededDocument> {
  const documentId = randomUUID();
  const fileObjectId = randomUUID();
  const versionId = randomUUID();
  const body = Buffer.from(`a12-document:${input.label}:${documentId}`);
  const hash = sha256Hex(body);
  const title = `A12 ${input.label}`;
  const stored = await createStorageService().putTenantObject({
    tenantId: tenantAlphaId,
    matterId,
    documentId,
    fileObjectId,
    body,
    contentLength: body.length,
    contentType: 'application/pdf',
  });
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        VALUES ($1, $2, $3, $4, $4, 'application/pdf', $5, $6, $7)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        stored.storageUri,
        `${input.label}.pdf`,
        body.length,
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
        VALUES ($1, $2, $3, $4, $5, $6, 'contract', 'standard', 'none', true, $7, now())
      `,
      [
        documentId,
        tenantAlphaId,
        matterId,
        randomUUID(),
        title,
        input.status,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO document_versions (
          version_id, tenant_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, version_label, version_significance
        )
        VALUES ($1, $2, $3, 1, 'current', $4, $5, $6, $7, $8)
      `,
      [
        versionId,
        tenantAlphaId,
        documentId,
        fileObjectId,
        hash,
        alphaOwnerUserId,
        input.significance === 'execution_copy' ? 'Execution' : 'Final',
        input.significance,
      ],
    );
  });
  await markPromotedFixture({ documentId, versionId });
  return { documentId, hash, title, versionId, body: body.toString('utf8') };
}

async function insertFiledEmail(
  matterId: string,
): Promise<{ emailId: string; hash: string; body: string }> {
  const emailId = randomUUID();
  const fileObjectId = randomUUID();
  const body = Buffer.from(`a12-email:${emailId}`);
  const hash = sha256Hex(body);
  const stored = await createStorageService().putEmailRawObject({
    tenantId: tenantAlphaId,
    emailId,
    fileObjectId,
    body,
    contentLength: body.length,
    contentType: 'message/rfc822',
  });
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, source_system, created_by
        )
        VALUES ($1, $2, $3, 'a12-closing.eml', 'a12-closing.eml', 'message/rfc822', $4, $5, 'email_ingest', $6)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        stored.storageUri,
        body.length,
        hash,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_messages (
          email_id, tenant_id, raw_file_object_id, message_id_hash, parser, parse_status,
          raw_sha256, raw_size_bytes, subject, created_by
        )
        VALUES ($1, $2, $3, $4, 'eml', 'parsed', $5, $6, 'A12 Closing Email', $7)
      `,
      [
        emailId,
        tenantAlphaId,
        fileObjectId,
        sha256Hex(`message-id:${emailId}`),
        hash,
        body.length,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_matter_filings (tenant_id, email_id, matter_id, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [tenantAlphaId, emailId, matterId, alphaOwnerUserId],
    );
  });
  return { emailId, hash, body: body.toString('utf8') };
}

async function binderArchiveRows(closingBinderId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      archive_count: string;
      binder_ref_count: string;
    }>(
      `
        SELECT count(*)::text AS archive_count,
          count(*) FILTER (WHERE closing_binder_id = $2)::text AS binder_ref_count
        FROM records_archives
        WHERE tenant_id = $1
          AND closing_binder_id = $2
      `,
      [tenantAlphaId, closingBinderId],
    );
    return result.rows[0] ?? { archive_count: '0', binder_ref_count: '0' };
  });
}

async function binderAudits(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: Record<string, unknown> }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action IN (
            'CLOSING_BINDER_CREATED',
            'CLOSING_BINDER_FINALIZED',
            'CLOSING_BINDER_MANIFEST_DOWNLOADED'
          )
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

async function mutateFinalizedManifest(closingBinderId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE closing_binders
        SET manifest_json = jsonb_set(manifest_json, '{tamper}', 'true'::jsonb)
        WHERE tenant_id = $1
          AND closing_binder_id = $2
      `,
      [tenantAlphaId, closingBinderId],
    );
  });
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('closing binder integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let betaCookie: string;
  let clientId: string;

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
    betaCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('finalizes a binder on Matter close with document hashes, email entry, records archives, and audits', async () => {
    const matterId = await createActiveMatter(baseUrl, ownerCookie, clientId);
    const executionA = await insertBinderDocument(matterId, {
      label: 'Execution A',
      status: 'executed',
      significance: 'execution_copy',
    });
    const executionB = await insertBinderDocument(matterId, {
      label: 'Execution B',
      status: 'final',
      significance: 'execution_copy',
    });
    const finalDocument = await insertBinderDocument(matterId, {
      label: 'Final Opinion',
      status: 'final',
      significance: 'final',
    });
    const filedEmail = await insertFiledEmail(matterId);

    await expectJson(await updateStatus(baseUrl, ownerCookie, matterId, 'closing'), 200);
    const closed = await expectJson<{ status: string; closedAt: string | null }>(
      await updateStatus(baseUrl, ownerCookie, matterId, 'closed'),
      200,
    );
    expect(closed).toEqual(expect.objectContaining({ status: 'closed' }));
    expect(closed.closedAt).toEqual(expect.any(String));

    const { binder } = await getBinder(baseUrl, ownerCookie, matterId);
    expect(binder).not.toBeNull();
    expect(binder?.status).toBe('finalized');
    expect(binder?.finalizedAt).toEqual(expect.any(String));
    expect(binder?.manifest.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: executionA.documentId,
          itemType: 'execution_copy',
          sha256: executionA.hash,
          title: executionA.title,
          versionId: executionA.versionId,
        }),
        expect.objectContaining({
          documentId: executionB.documentId,
          itemType: 'execution_copy',
          sha256: executionB.hash,
        }),
        expect.objectContaining({
          documentId: finalDocument.documentId,
          itemType: 'final_version',
          sha256: finalDocument.hash,
        }),
        expect.objectContaining({
          emailId: filedEmail.emailId,
          itemType: 'key_email',
          sha256: filedEmail.hash,
        }),
      ]),
    );
    expect(binder?.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(binder?.recordsArchiveCount).toBe(3);

    const archiveRows = await binderArchiveRows(binder!.closingBinderId);
    expect(archiveRows).toEqual({ archive_count: '3', binder_ref_count: '3' });
    await expect(mutateFinalizedManifest(binder!.closingBinderId)).rejects.toThrow(
      /finalized manifest is immutable/u,
    );

    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/closing-binder`, {
      headers: { cookie: betaCookie },
    });
    expect(denied.status, await denied.text()).toBe(403);

    const jsonDownload = await fetch(
      `${baseUrl}/v1/matters/${matterId}/closing-binder/manifest?format=json`,
      { headers: { cookie: ownerCookie } },
    );
    const jsonBody = await jsonDownload.text();
    expect(jsonDownload.status, jsonBody).toBe(200);
    expect(jsonBody).toContain(executionA.hash);

    const csvDownload = await fetch(
      `${baseUrl}/v1/matters/${matterId}/closing-binder/manifest?format=csv`,
      { headers: { cookie: ownerCookie } },
    );
    const csvBody = await csvDownload.text();
    expect(csvDownload.status, csvBody).toBe(200);
    expect(csvBody).toContain('item_type,title,document_id,version_id,version_label,email_id,sha256');
    expect(csvBody).toContain(finalDocument.hash);

    const archiveDownload = await fetch(
      `${baseUrl}/v1/matters/${matterId}/closing-binder/archive`,
      { headers: { cookie: ownerCookie } },
    );
    const archiveBody = Buffer.from(await archiveDownload.arrayBuffer());
    expect(archiveDownload.status, archiveBody.toString('utf8')).toBe(200);
    expect(archiveDownload.headers.get('content-type')).toContain('application/zip');
    expect(archiveDownload.headers.get('x-file-count')).toBe('4');
    expect(archiveDownload.headers.get('x-item-count')).toBe(String(binder?.manifest.items.length));
    expect(archiveDownload.headers.get('x-content-sha256')).toBe(sha256Hex(archiveBody));
    const archiveText = archiveBody.toString('utf8');
    expect(archiveText).toContain('manifest.json');
    expect(archiveText).toContain(executionA.body);
    expect(archiveText).toContain(executionB.body);
    expect(archiveText).toContain(finalDocument.body);
    expect(archiveText).toContain(filedEmail.body);

    const audits = await binderAudits(matterId);
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'CLOSING_BINDER_CREATED',
        'CLOSING_BINDER_FINALIZED',
        'CLOSING_BINDER_MANIFEST_DOWNLOADED',
      ]),
    );
    expect(audits.find((row) => row.action === 'CLOSING_BINDER_FINALIZED')?.metadata_json).toEqual(
      expect.objectContaining({
        archive_count: 3,
        document_count: 3,
        item_count: 4,
        matter_id: matterId,
      }),
    );
    expect(
      audits.find(
        (row) =>
          row.action === 'CLOSING_BINDER_MANIFEST_DOWNLOADED' &&
          row.metadata_json.export_format === 'zip',
      )?.metadata_json,
    ).toEqual(
      expect.objectContaining({
        archive_count: 4,
        document_count: 3,
        download_byte_count: archiveBody.length,
        hash: archiveDownload.headers.get('x-content-sha256'),
        item_count: 4,
        matter_id: matterId,
      }),
    );
  });
});
