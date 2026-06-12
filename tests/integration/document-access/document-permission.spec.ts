import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantBetaId } from '../helpers/db';
import {
  addBetaMember,
  accessDeniedReasonCount,
  auditCount,
  betaMemberUserId,
  betaOwnerUserId,
  createClient,
  createMatter,
  createStorageService,
  excludeUserWithEthicalWall,
  grantDocumentPermission,
  latestAuditMetadata,
  loginAlphaOwner,
  loginBetaMember,
  loginBetaOwner,
  setDocumentConfidentiality,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';

describe('document-permission integration', () => {
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

  it('enforces confidentiality explicit allow and download reason policy', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DPERM');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DPERM');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'permission');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const standardRead = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(standardRead.status, await standardRead.text()).toBe(200);

    await setDocumentConfidentiality(uploaded.documentId, 'high');
    const highDenied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(highDenied.status).toBe(404);
    expect(await highDenied.json()).toMatchObject({ code: 'PERMISSION_DENIED' });

    await grantDocumentPermission({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      subjectUserId: betaMemberUserId,
      action: 'read',
      createdBy: betaOwnerUserId,
    });
    const highRead = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(highRead.status, await highRead.text()).toBe(200);

    await grantDocumentPermission({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      subjectUserId: betaMemberUserId,
      action: 'download',
      createdBy: betaOwnerUserId,
    });
    const missingReason = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/download`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(missingReason.status).toBe(400);
    expect(await missingReason.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DOWNLOAD_REASON_REQUIRED',
    });

    const invalidReason = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download?reasonCode=not_allowed`,
      { headers: { cookie: betaMemberCookie } },
    );
    expect(invalidReason.status).toBe(400);

    const download = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download?reasonCode=casework&reasonText=${encodeURIComponent('Client requested copy')}`,
      { headers: { cookie: betaMemberCookie } },
    );
    expect(download.status, await download.text()).toBe(200);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toMatchObject({
      reason_code: 'casework',
      document_id: uploaded.documentId,
      matter_id: matterId,
    });

    await grantDocumentPermission({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      subjectUserId: betaMemberUserId,
      action: 'read',
      effect: 'DENY',
      createdBy: betaOwnerUserId,
    });
    const explicitDeny = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(explicitDeny.status).toBe(404);
  });

  it('keeps denied and missing document responses safe', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'SAFE');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'SAFE');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'safe-denied-title');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    const missing = await fetch(`${baseUrl}/v1/documents/${randomUUID()}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(denied.status).toBe(missing.status);
    expect(denied.status).toBe(404);
    const deniedBody = await denied.json();
    const missingBody = await missing.json();
    expect(deniedBody.code).toBe('PERMISSION_DENIED');
    expect(missingBody.code).toBe('PERMISSION_DENIED');
    expect(JSON.stringify(deniedBody)).not.toContain('safe-denied-title');
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);
  });

  it('does not rely on permission UI for enforcement', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'UIBYPASS');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'UIBYPASS');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'ui-bypass');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const bypass = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ confidentialityLevel: 'restricted' }),
    });
    expect(bypass.status, await bypass.text()).toBe(403);
  });

  it('denies wall-excluded document read and download even with explicit document allows', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DWALL');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DWALL');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'document-wall');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
    await grantDocumentPermission({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      subjectUserId: betaMemberUserId,
      action: 'read',
      createdBy: betaOwnerUserId,
    });
    await grantDocumentPermission({
      tenantId: tenantBetaId,
      documentId: uploaded.documentId,
      subjectUserId: betaMemberUserId,
      action: 'download',
      createdBy: betaOwnerUserId,
    });
    await excludeUserWithEthicalWall({
      tenantId: tenantBetaId,
      matterId,
      userId: betaMemberUserId,
      createdBy: betaOwnerUserId,
    });

    const read = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaMemberCookie },
    });
    const readBody = await read.text();
    expect(read.status, readBody).toBe(404);
    expect(JSON.parse(readBody)).toMatchObject({ code: 'PERMISSION_DENIED' });

    const download = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download?reasonCode=casework`,
      { headers: { cookie: betaMemberCookie } },
    );
    const downloadBody = await download.text();
    expect(download.status, downloadBody).toBe(404);
    expect(JSON.parse(downloadBody)).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(await accessDeniedReasonCount(uploaded.documentId, 'ETHICAL_WALL_BLOCKED')).toBeGreaterThanOrEqual(
      2,
    );
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toBe(0);
  });
});
