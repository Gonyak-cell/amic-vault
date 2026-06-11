import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantBetaId } from '../helpers/db';
import {
  createClient,
  createMatter,
  createStorageService,
  loginAlphaOwner,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';

describe('safe-denied-message integration', () => {
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

  it('keeps unauthorized document read, download, preview, and missing responses metadata-free', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'SAFE2');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'SAFE2');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'secret-title');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const paths = [
      `/v1/documents/${uploaded.documentId}`,
      `/v1/documents/${uploaded.documentId}/download`,
      `/v1/documents/${uploaded.documentId}/preview`,
      `/v1/documents/${randomUUID()}`,
    ];
    for (const path of paths) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: alphaOwnerCookie } });
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain('PERMISSION_DENIED');
      expect(body).not.toContain('secret-title');
      expect(body).not.toContain(matterId);
      expect(body).not.toContain(uploaded.documentId);
    }
  });
});
