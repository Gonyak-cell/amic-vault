import 'reflect-metadata';
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
  loginBetaOwner,
  setDocumentStatus,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';

function versionForm(): FormData {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-1.7 archived mutation')], { type: 'application/pdf' }), 'archived-next.pdf');
  return form;
}

describe('archived-mutation-block integration', () => {
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

  it('blocks metadata, version, and delete mutations for archived documents', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'ARCH');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'ARCH');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'archived');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));
    await setDocumentStatus(uploaded.documentId, 'archived');

    const metadata = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/metadata`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Archived Mutated' }),
    });
    expect(metadata.status, await metadata.text()).toBe(400);

    const version = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/versions`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
      body: versionForm(),
    });
    expect(version.status, await version.text()).toBe(400);

    const deleted = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    const body = await deleted.text();
    expect(deleted.status, body).toBe(400);
    expect(body).toContain('DOCUMENT_LOCKED');
  });
});
