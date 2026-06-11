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
  previewArtifactSummary,
  storageUrisForDocument,
  uploadDocx,
  uploadPdf,
} from './document-api-helpers';

describe('preview integration', () => {
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

  it('streams PDF preview through document permission and records preview VIEWED once', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PREV');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PREV');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-pdf');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(denied.status).toBe(404);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);

    const preview = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(preview.status, await preview.text()).toBe(200);
    expect(preview.headers.get('content-type')).toContain('application/pdf');
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_VIEWED')).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      channel: 'preview',
    });

    const range = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie, range: 'bytes=0-7' },
    });
    expect(range.status, await range.text()).toBe(206);
    expect(range.headers.get('content-range')).toMatch(/^bytes 0-7\//);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
  });

  it('creates a DOCX preview derivative without adding a document version', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PDOCX');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PDOCX');
    const uploaded = await uploadDocx(baseUrl, betaOwnerCookie, matterId, 'preview-docx');

    const preview = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    const body = await preview.text();
    expect(preview.status, body).toBe(200);
    expect(body.startsWith('%PDF')).toBe(true);
    const summary = await previewArtifactSummary(uploaded.documentId);
    expect(summary).toMatchObject({
      artifact_count: '1',
      version_count: '1',
      preview_file_count: '1',
    });
    expect(summary?.source_systems).toContain('preview_derived');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
  });
});
