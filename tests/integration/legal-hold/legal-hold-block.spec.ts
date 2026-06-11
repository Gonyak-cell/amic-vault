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
  setDocumentLegalHold,
  setMatterLegalHold,
  storageUrisForDocument,
  uploadPdf,
} from '../document-access/document-api-helpers';

describe('legal-hold-block integration', () => {
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

  it('blocks delete by document and matter hold flags, then allows delete after release', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'HOLD');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'HOLD');
    const documentHold = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'doc-hold');
    const matterHold = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'matter-hold');
    storageUris.push(...(await storageUrisForDocument(documentHold.documentId)));
    storageUris.push(...(await storageUrisForDocument(matterHold.documentId)));

    await setDocumentLegalHold(documentHold.documentId, true);
    const documentHeld = await fetch(`${baseUrl}/v1/documents/${documentHold.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    const documentHeldBody = await documentHeld.text();
    expect(documentHeld.status, documentHeldBody).toBe(400);
    expect(documentHeldBody).toContain('DOCUMENT_LOCKED');

    await setMatterLegalHold(matterId, true);
    const matterHeld = await fetch(`${baseUrl}/v1/documents/${matterHold.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    const matterHeldBody = await matterHeld.text();
    expect(matterHeld.status, matterHeldBody).toBe(400);
    expect(matterHeldBody).toContain('DOCUMENT_LOCKED');

    await setDocumentLegalHold(documentHold.documentId, false);
    await setMatterLegalHold(matterId, false);
    const released = await fetch(`${baseUrl}/v1/documents/${documentHold.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    expect(released.status, await released.text()).toBe(204);
  });
});
