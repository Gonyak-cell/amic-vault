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
} from './document-api-helpers';

describe('document-download integration', () => {
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

  it('streams only authorized current file bytes and records one download audit', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DOWN');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DOWN');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'download');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/download`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(await denied.text()).toContain('PERMISSION_DENIED');
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toBe(0);

    const response = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/download`, {
      headers: { cookie: betaOwnerCookie },
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(body).toContain('AMIC-download');
    expect(response.headers.get('content-disposition')).toContain('download.pdf');
    expect(response.headers.get('x-amic-sha256')).toMatch(/^[0-9a-f]{64}$/);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DOWNLOADED')).toEqual({
      document_id: uploaded.documentId,
      matter_id: matterId,
      version_id: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const deleted = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    expect(deleted.status, await deleted.text()).toBe(204);
    const deletedDownload = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/download`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(deletedDownload.status, await deletedDownload.text()).toBe(400);
  });
});
