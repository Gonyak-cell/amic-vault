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

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; body: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.body);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function docxBytes(marker: string): Buffer {
  return zipStore([
    {
      name: '[Content_Types].xml',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      body:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:p><w:r><w:t>AMIC-DOCX-' +
        marker +
        '</w:t></w:r></w:p></w:body></w:document>',
    },
  ]);
}

function docxForm(marker: string): FormData {
  const form = new FormData();
  form.append('title', `${marker} Document`);
  form.append(
    'file',
    new Blob([docxBytes(marker)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    `${marker}.docx`,
  );
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

export async function uploadDocx(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
): Promise<{ documentId: string; fileObjectId: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: docxForm(marker),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as { documentId: string; fileObjectId: string };
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
        FROM file_objects f
        WHERE f.storage_uri LIKE (
          's3://amic-vault-dev/tenants/%/matters/%/documents/' || $1 || '/%'
        )
      `,
      [documentId],
    );
    return result.rows.map((row) => row.storage_uri);
  });
}

export async function setDocumentConfidentiality(
  documentId: string,
  confidentialityLevel: 'standard' | 'high' | 'restricted',
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE documents
        SET confidentiality_level = $2,
            updated_at = now()
        WHERE document_id = $1
      `,
      [documentId, confidentialityLevel],
    );
  });
}

export async function grantDocumentPermission(input: {
  tenantId: string;
  documentId: string;
  subjectUserId: string;
  action: 'read' | 'download';
  effect?: 'ALLOW' | 'DENY';
  createdBy: string;
  conditionJson?: Record<string, unknown> | null;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, condition_json, created_by
        )
        VALUES ($1, 'user', $2, 'document', $3, $4, $5, $6::jsonb, $7)
      `,
      [
        input.tenantId,
        input.subjectUserId,
        input.documentId,
        input.action,
        input.effect ?? 'ALLOW',
        input.conditionJson ? JSON.stringify(input.conditionJson) : null,
        input.createdBy,
      ],
    );
  });
}

export async function previewArtifactSummary(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      artifact_count: string;
      version_count: string;
      preview_file_count: string;
      source_systems: string[];
    }>(
      `
        SELECT count(DISTINCT a.artifact_id)::text AS artifact_count,
          count(DISTINCT dv.version_id)::text AS version_count,
          count(DISTINCT f.file_object_id)::text AS preview_file_count,
          array_agg(DISTINCT f.source_system) AS source_systems
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        LEFT JOIN document_preview_artifacts a
          ON a.tenant_id = d.tenant_id
          AND a.document_id = d.document_id
        LEFT JOIN file_objects f
          ON f.tenant_id = a.tenant_id
          AND f.file_object_id = a.file_object_id
        WHERE d.document_id = $1
        GROUP BY d.document_id
      `,
      [documentId],
    );
    return result.rows[0];
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
