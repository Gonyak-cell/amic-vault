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
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
  title: string;
  documentType: string;
  confidentialityLevel: string;
  metadataSuggestion: {
    documentType?: string;
    date?: string;
    versionLabel?: string;
  };
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
    body: JSON.stringify({ name: `Metadata Client ${randomUUID()}` }),
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
      matterCode: `META-${randomUUID()}`,
      matterName: `Document Metadata ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

function uploadForm(filename: string): FormData {
  const form = new FormData();
  form.append('title', 'Metadata Draft');
  form.append(
    'file',
    new Blob([Buffer.from('%PDF-1.7 metadata')], { type: 'application/pdf' }),
    filename,
  );
  return form;
}

async function upload(baseUrl: string, cookie: string, matterId: string): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: uploadForm('2026-06-12_계약서_v2.pdf'),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadResponse;
}

async function documentRow(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      tenant_id: string;
      matter_id: string;
      storage_uri: string;
      document_type: string;
      subtype: string | null;
      confidentiality_level: string;
      privilege_status: string;
    }>(
      `
        SELECT d.tenant_id, d.matter_id, f.storage_uri, d.document_type, d.subtype,
          d.confidentiality_level, d.privilege_status
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

async function metadataAuditCount(documentId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'DOCUMENT_METADATA_CHANGED'
      `,
      [tenantBetaId, documentId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function latestMetadataAudit(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'DOCUMENT_METADATA_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, documentId],
    );
    return result.rows[0];
  });
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('document-metadata integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaMatterId: string;
  const createdStorageUris: string[] = [];

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
    for (const storageUri of createdStorageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri);
    }
    await app.close();
  });

  it('creates metadata defaults, suggests filename metadata, and audits manual edits', async () => {
    const uploaded = await upload(baseUrl, betaOwnerCookie, betaMatterId);
    expect(uploaded.title).toBe('Metadata Draft');
    expect(uploaded.documentType).toBe('other');
    expect(uploaded.confidentialityLevel).toBe('standard');
    expect(uploaded.metadataSuggestion).toEqual({
      documentType: 'contract',
      date: '2026-06-12',
      versionLabel: 'v2',
    });

    const beforeRow = await documentRow(uploaded.documentId);
    expect(beforeRow).toMatchObject({
      document_type: 'other',
      subtype: null,
      confidentiality_level: 'standard',
      privilege_status: 'none',
    });
    if (beforeRow?.storage_uri) createdStorageUris.push(beforeRow.storage_uri);

    const update = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Metadata Title',
        documentType: 'memo',
        subtype: 'review',
        confidentialityLevel: 'restricted',
      }),
    });
    const updateBody = await update.text();
    expect(update.status, updateBody).toBe(200);
    expect(JSON.parse(updateBody)).toMatchObject({
      title: 'Updated Metadata Title',
      documentType: 'memo',
      subtype: 'review',
      confidentialityLevel: 'restricted',
      privilegeStatus: 'none',
    });

    const audit = await latestMetadataAudit(uploaded.documentId);
    expect(audit?.metadata_json).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: betaMatterId,
      diff_keys: ['title', 'document_type', 'subtype', 'confidentiality_level'],
      before_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
      after_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
      decision_ref: expect.stringMatching(/^matter-source-mutation:[0-9a-f]{64}$/),
      scope_id: 'matter_app_event_projection',
      scope_type: 'matter_app_source',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Updated Metadata Title');

    const countBeforeNoop = await metadataAuditCount(uploaded.documentId);
    const noop = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Metadata Title',
        documentType: 'memo',
        subtype: 'review',
        confidentialityLevel: 'restricted',
      }),
    });
    expect(noop.status, await noop.text()).toBe(200);
    expect(await metadataAuditCount(uploaded.documentId)).toBe(countBeforeNoop);
  });

  it('fails closed for invalid metadata, non-members, and cross-tenant access', async () => {
    const uploaded = await upload(baseUrl, betaOwnerCookie, betaMatterId);
    const row = await documentRow(uploaded.documentId);
    if (row?.storage_uri) createdStorageUris.push(row.storage_uri);

    const invalidType = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentType: 'MA' }),
    });
    expect(invalidType.status, await invalidType.text()).toBe(400);

    const forbidden = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Should Not Apply' }),
    });
    expect(forbidden.status, await forbidden.text()).toBe(403);

    const crossTenant = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: alphaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Should Not Leak' }),
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).not.toContain(uploaded.documentId);
  });
});
