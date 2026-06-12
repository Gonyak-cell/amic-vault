import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  ExternalAccessManifestDto,
  ExternalAccessStatusResponseDto,
  ExternalLinkCreatedResponseDto,
  ExternalLinkDto,
  ExternalNdaAcceptanceDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('External core integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let workspace: ExternalWorkspaceDto;
  let externalUser: ExternalUserDto;
  let link: ExternalLinkDto;
  let linkToken: string;

  beforeAll(async () => {
    await insertDocument({
      documentId,
      versionId,
      title: `External ${marker} primary file`,
      text: 'External sharing body must not appear in manifest.',
      index: 1501,
    });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      title: `External ${marker} denied file`,
      text: 'Denied external material.',
      index: 1502,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: deniedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates workspace, external user, secure link, NDA acceptance, and watermark manifest', async () => {
    workspace = await postJson<ExternalWorkspaceDto>('/v1/external/workspaces', {
      matterId,
      workspaceCode: `EXT-${marker}`,
      displayRef: `External room ${marker}`,
      expiresAt: futureIso(7),
    });
    expect(workspace.matterId).toBe(matterId);

    externalUser = await postJson<ExternalUserDto>('/v1/external/users', {
      workspaceId: workspace.workspaceId,
      emailHash: sha256Hex(`recipient-${marker}@example.test`),
      displayRef: `recipient ${marker}`,
    });
    expect(externalUser.status).toBe('active');

    const created = await postJson<ExternalLinkCreatedResponseDto>('/v1/external/links', {
      workspaceId: workspace.workspaceId,
      externalUserId: externalUser.externalUserId,
      documentId,
      versionId,
      expiresAt: futureIso(3),
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired: true,
    });
    link = created.link;
    linkToken = created.linkToken;
    expect(link.linkId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(link.documentId).toBe(documentId);
    expect(linkToken).toHaveLength(43);

    const beforeStatus = await getPublicJson<ExternalAccessStatusResponseDto>(
      `/v1/external/access/${linkToken}`,
    );
    expect(beforeStatus).toMatchObject({ status: 'nda_required', ndaRequired: true });

    const deniedManifest = await fetch(`${baseUrl}/v1/external/access/${linkToken}/manifest`);
    const deniedText = await deniedManifest.text();
    expect(deniedManifest.status, deniedText).toBe(403);
    expect(deniedText).not.toContain(documentId);

    const nda = await postPublicJson<ExternalNdaAcceptanceDto>(
      `/v1/external/access/${linkToken}/nda`,
      {
        accepted: true,
        ndaVersion: 'NDA-R11-V1',
      },
    );
    expect(nda.accepted).toBe(true);

    const manifest = await getPublicJson<ExternalAccessManifestDto>(
      `/v1/external/access/${linkToken}/manifest`,
    );
    expect(manifest).toMatchObject({
      status: 'ready',
      workspaceId: workspace.workspaceId,
      externalUserId: externalUser.externalUserId,
      documentId,
      versionId,
      watermarkApplied: true,
    });
    expect(manifest.watermarkRef).toContain(link.linkId);
    expect(JSON.stringify(manifest)).not.toContain('External sharing body');
    expect(JSON.stringify(manifest)).not.toContain(`External ${marker} primary file`);
    expect(JSON.stringify(manifest)).not.toContain(linkToken);

    const accessAudit = await latestExternalAudit('EXTERNAL_LINK_ACCESSED', link.linkId);
    expect(accessAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      external_workspace_id: workspace.workspaceId,
      external_user_id: externalUser.externalUserId,
      external_link_id: link.linkId,
      access_status: 'ready',
    });
    expect(JSON.stringify(accessAudit?.metadata_json)).not.toContain(linkToken);
    expect(JSON.stringify(accessAudit?.metadata_json)).not.toContain('External sharing body');
  });

  it('blocks denied documents before secure link creation', async () => {
    const response = await fetch(`${baseUrl}/v1/external/links`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspace.workspaceId,
        externalUserId: externalUser.externalUserId,
        documentId: deniedDocumentId,
        expiresAt: futureIso(3),
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);

    const audit = await latestExternalAudit('EXTERNAL_LINK_CREATED', deniedDocumentId);
    expect(audit).toBeUndefined();
  });

  it('blocks revoked and expired links', async () => {
    const malformedRevoke = await fetch(`${baseUrl}/v1/external/links/not-a-link/revoke`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const malformedRevokeText = await malformedRevoke.text();
    expect(malformedRevoke.status, malformedRevokeText).toBe(404);
    expect(malformedRevokeText).toContain('PERMISSION_DENIED');

    const revokeResponse = await fetch(`${baseUrl}/v1/external/links/${link.linkId}/revoke`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const revokeText = await revokeResponse.text();
    expect(revokeResponse.status, revokeText).toBe(200);
    const revoked = JSON.parse(revokeText) as ExternalLinkDto;
    expect(revoked.status).toBe('revoked');

    const revokedResponse = await fetch(`${baseUrl}/v1/external/access/${linkToken}/manifest`);
    const revokedText = await revokedResponse.text();
    expect(revokedResponse.status, revokedText).toBe(403);

    const second = await postJson<ExternalLinkCreatedResponseDto>('/v1/external/links', {
      workspaceId: workspace.workspaceId,
      externalUserId: externalUser.externalUserId,
      documentId,
      expiresAt: futureIso(3),
    });
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          UPDATE external_secure_links
          SET expires_at = now() - interval '1 minute'
          WHERE tenant_id = $1
            AND link_id = $2
        `,
        [tenantAlphaId, second.link.linkId],
      );
    });
    const expired = await fetch(`${baseUrl}/v1/external/access/${second.linkToken}`);
    const expiredText = await expired.text();
    expect(expired.status, expiredText).toBe(410);
    expect(expiredText).toContain('EXTERNAL_LINK_EXPIRED');
  });

  it('keeps external tables tenant-RLS protected and runtime-destructive grants absent', async () => {
    const evidence = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const rls = await client.query<{ table_name: string; rls: boolean; force_rls: boolean }>(
        `
          SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN (
              'external_workspaces',
              'external_users',
              'external_workspace_members',
              'external_secure_links',
              'external_nda_acceptances'
            )
          ORDER BY c.relname
        `,
      );
      const destructive = await client.query<{ table_name: string; privilege_type: string }>(
        `
          SELECT table_name, privilege_type
          FROM information_schema.role_table_grants
          WHERE grantee = 'vault_app'
            AND table_name LIKE 'external_%'
            AND privilege_type IN ('DELETE', 'TRUNCATE')
          ORDER BY table_name, privilege_type
        `,
      );
      return {
        rls: rls.rows.map((row) => `${row.table_name}:${row.rls}:${row.force_rls}`),
        destructive: destructive.rows,
      };
    });
    expect(evidence.rls).toEqual([
      'external_nda_acceptances:true:true',
      'external_secure_links:true:true',
      'external_users:true:true',
      'external_workspace_members:true:true',
      'external_workspaces:true:true',
    ]);
    expect(evidence.destructive).toEqual([]);
  });

  async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function postPublicJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-amic-external-actor-ref': marker },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function getPublicJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'x-amic-external-actor-ref': marker },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function insertDocument(input: {
    documentId: string;
    versionId: string;
    title: string;
    text: string;
    index: number;
  }): Promise<void> {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId: input.documentId,
        versionId: input.versionId,
        title: input.title,
        contentText: input.text,
        documentType: 'evidence',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
      input.index,
    );
  }
});

function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function latestExternalAudit(action: string, targetId: string) {
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
      [
        tenantAlphaId,
        action,
        targetId,
        JSON.stringify({ document_id: targetId }),
      ],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}
