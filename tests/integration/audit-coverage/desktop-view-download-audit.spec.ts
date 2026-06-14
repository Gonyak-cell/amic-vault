import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { API_NO_STORE_HEADER_VALUE } from '../../../apps/api/src/common/security/no-store.middleware';
import { configureApp } from '../../../apps/api/src/main';
import { tenantBetaId } from '../helpers/db';
import {
  auditCount,
  createClient,
  createMatter,
  createStorageService,
  latestAuditMetadata,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from '../document-access/document-api-helpers';

describe('desktop view and download audit integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('keeps desktop document view/download server-audited and no-store', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DPWA');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DPWA');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'desktop-pwa');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const detail = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(detail.status, await detail.text()).toBe(200);
    expect(detail.headers.get('cache-control')).toBe(API_NO_STORE_HEADER_VALUE);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      channel: 'detail',
    });

    const download = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/download`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(download.status, await download.text()).toBe(200);
    expect(download.headers.get('cache-control')).toBe(API_NO_STORE_HEADER_VALUE);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});
