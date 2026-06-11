import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantBetaId } from '../helpers/db';
import {
  auditCount,
  createClient,
  createMatter,
  createStorageService,
  latestAuditMetadata,
  loginAlphaOwner,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from '../document-access/document-api-helpers';

describe('document-audit integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('records DOCUMENT_VIEWED for detail reads only', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'VAUD');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'VAUD');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'view-audit');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

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
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED')).toEqual({
      document_id: uploaded.documentId,
      matter_id: matterId,
    });
  });
});
