import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { NoopEncryptionHook } from '../../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../../apps/api/src/modules/storage/s3-storage.adapter';
import { StoragePathResolver } from '../../../apps/api/src/modules/storage/storage-path.resolver';
import { StorageService } from '../../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

export const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
export const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';
export const betaMemberUserId = '22222222-2222-4222-8222-222222222202';

export async function login(
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

export async function loginAlphaOwner(baseUrl: string): Promise<string> {
  return login(baseUrl, {
    tenantId: tenantAlphaId,
    email: 'alpha-matter-owner@test.local',
    password: 'dev-alpha-owner-password',
  });
}

export async function loginBetaOwner(baseUrl: string): Promise<string> {
  return login(baseUrl, {
    tenantId: tenantBetaId,
    email: 'beta-matter-owner@test.local',
    password: 'dev-beta-owner-password',
  });
}

export async function loginBetaMember(baseUrl: string): Promise<string> {
  return login(baseUrl, {
    tenantId: tenantBetaId,
    email: 'beta-member@test.local',
    password: 'dev-beta-member-password',
  });
}

export async function createClient(baseUrl: string, cookie: string, marker: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `${marker} Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

export async function createMatter(baseUrl: string, cookie: string, clientId: string, marker: string) {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `${marker}-${randomUUID()}`,
      matterName: `${marker} Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

export async function addBetaMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  accessLevel: 'read' | 'edit' = 'read',
) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: betaMemberUserId,
      matterRole: 'member',
      accessLevel,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
}

function pdfForm(marker: string): FormData {
  const bytes = Buffer.from(`%PDF-1.7\nAMIC-${marker}\n`);
  const form = new FormData();
  form.append('title', `${marker} Document`);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), `${marker}.pdf`);
  return form;
}

export async function uploadPdf(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
): Promise<{ documentId: string; fileObjectId: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: pdfForm(marker),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const parsed = JSON.parse(body) as { documentId: string; fileObjectId: string };
  expect(parsed.documentId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return parsed;
}

export function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

export async function storageUrisForDocument(documentId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ storage_uri: string }>(
      `
        SELECT f.storage_uri
        FROM document_versions dv
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE dv.document_id = $1
      `,
      [documentId],
    );
    return result.rows.map((row) => row.storage_uri);
  });
}

export async function documentLifecycleRow(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      status: string;
      deleted_at: Date | null;
      deleted_by: string | null;
      deleted_previous_status: string | null;
      version_count: string;
      file_object_count: string;
    }>(
      `
        SELECT d.status, d.deleted_at, d.deleted_by, d.deleted_previous_status,
          count(DISTINCT dv.version_id)::text AS version_count,
          count(DISTINCT f.file_object_id)::text AS file_object_count
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        LEFT JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE d.document_id = $1
        GROUP BY d.document_id
      `,
      [documentId],
    );
    return result.rows[0];
  });
}

export async function setDocumentStatus(documentId: string, status: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE documents
        SET status = $2,
            updated_at = now()
        WHERE document_id = $1
      `,
      [documentId, status],
    );
  });
}

export async function setDocumentLegalHold(documentId: string, legalHold: boolean): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE documents
        SET legal_hold = $2,
            updated_at = now()
        WHERE document_id = $1
      `,
      [documentId, legalHold],
    );
  });
}

export async function setMatterLegalHold(matterId: string, legalHold: boolean): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE matters
        SET legal_hold = $2,
            updated_at = now()
        WHERE matter_id = $1
      `,
      [matterId, legalHold],
    );
  });
}

export async function auditCount(documentId: string, action: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE target_id = $1
          AND action = $2
      `,
      [documentId, action],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

export async function latestAuditMetadata(documentId: string, action: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE target_id = $1
          AND action = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [documentId, action],
    );
    return result.rows[0]?.metadata_json;
  });
}

export function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') {
      return [];
    }
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.isFile()) return [];
    return /\.(ts|tsx|js|mjs|py)$/.test(entry.name) ? [full] : [];
  });
}

export function readIfSmall(file: string): string {
  const stat = statSync(file);
  if (stat.size > 500_000) return '';
  return readFileSync(file, 'utf8');
}
