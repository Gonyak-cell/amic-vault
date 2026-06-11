import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantBetaId } from '../helpers/db';
import {
  addBetaMember,
  auditCount,
  createClient,
  createMatter,
  createStorageService,
  latestAuditMetadata,
  loginAlphaOwner,
  loginBetaMember,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from '../document-access/document-api-helpers';

interface DocumentAuditEventItem {
  eventId: string;
  action: string;
  metadata: Record<string, unknown>;
}

interface DocumentAuditEventList {
  items: DocumentAuditEventItem[];
  nextCursor: string | null;
}

describe('document-audit integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    betaMemberCookie = await loginBetaMember(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('records reference-only DOCUMENT_* events and exposes document audit events to matter owner only', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'VAUD');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'VAUD');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'view-audit');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    expect(await auditCount(uploaded.documentId, 'DOCUMENT_UPLOADED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_UPLOADED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(await denied.text()).toContain('PERMISSION_DENIED');
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);

    const versions = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(versions.status, await versions.text()).toBe(200);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);

    const detail = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(detail.status, await detail.text()).toBe(200);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: expect.any(String),
      channel: 'detail',
    });

    const download = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download?reasonCode=casework`,
      { headers: { cookie: betaOwnerCookie } },
    );
    expect(download.status, await download.text()).toBe(200);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      reason_code: 'casework',
    });

    const metadata = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Do Not Leak This Title', documentType: 'memo' }),
    });
    expect(metadata.status, await metadata.text()).toBe(200);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_METADATA_CHANGED'))
      .toMatchObject({
        document_id: uploaded.documentId,
        matter_id: matterId,
        diff_keys: ['title', 'document_type'],
        before_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
        after_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
      });

    const deleted = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    expect(deleted.status, await deleted.text()).toBe(204);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DELETED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      before_ref: 'document_status:draft',
      after_ref: 'document_status:deleted',
    });

    const restored = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/restore`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
    });
    expect(restored.status, await restored.text()).toBe(204);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_RESTORED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      before_ref: 'document_status:deleted',
      after_ref: 'document_status:draft',
    });

    const firstPageResponse = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/audit-events?limit=3`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const firstPageBody = await firstPageResponse.text();
    expect(firstPageResponse.status, firstPageBody).toBe(200);
    const firstPage = JSON.parse(firstPageBody) as DocumentAuditEventList;
    expect(firstPage.items).toHaveLength(3);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items.map((item) => item.action)).toEqual([
      'DOCUMENT_RESTORED',
      'DOCUMENT_DELETED',
      'DOCUMENT_METADATA_CHANGED',
    ]);

    const secondPageResponse = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/audit-events?limit=3&cursor=${encodeURIComponent(
        firstPage.nextCursor ?? '',
      )}`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const secondPageBody = await secondPageResponse.text();
    expect(secondPageResponse.status, secondPageBody).toBe(200);
    const secondPage = JSON.parse(secondPageBody) as DocumentAuditEventList;
    expect(secondPage.items.map((item) => item.action)).toEqual([
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_UPLOADED',
    ]);
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.eventId)).size).toBe(
      6,
    );

    const uploadedOnlyResponse = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/audit-events?event_type=DOCUMENT_UPLOADED`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const uploadedOnlyBody = await uploadedOnlyResponse.text();
    expect(uploadedOnlyResponse.status, uploadedOnlyBody).toBe(200);
    const uploadedOnly = JSON.parse(uploadedOnlyBody) as DocumentAuditEventList;
    expect(uploadedOnly.items).toHaveLength(1);
    expect(uploadedOnly.items[0]).toMatchObject({
      action: 'DOCUMENT_UPLOADED',
      metadata: {
        document_id: uploaded.documentId,
        matter_id: matterId,
        version_id: expect.any(String),
      },
    });

    const invalidFilter = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/audit-events?event_type=USER_LOGIN`,
      { headers: { cookie: betaOwnerCookie } },
    );
    expect(invalidFilter.status, await invalidFilter.text()).toBe(400);

    const memberAudit = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/audit-events`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(memberAudit.status, await memberAudit.text()).toBe(404);

    const crossTenantAudit = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/audit-events`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(crossTenantAudit.status, await crossTenantAudit.text()).toBe(404);

    const auditBodies = [
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_UPLOADED'),
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED'),
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DOWNLOADED'),
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_METADATA_CHANGED'),
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DELETED'),
      await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_RESTORED'),
    ];
    expect(JSON.stringify(auditBodies)).not.toContain('Do Not Leak This Title');
    expect(JSON.stringify(auditBodies)).not.toContain('AMIC-view-audit');
  });
});
