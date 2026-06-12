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
  documentLifecycleRow,
  latestAuditMetadata,
  loginBetaMember,
  loginBetaOwner,
  readIfSmall,
  sourceFiles,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';

describe('document-lifecycle integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
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

  it('soft deletes without physical row/object deletion and restores only by owner authority', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'LIFE');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'LIFE');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'lifecycle');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaMemberCookie },
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(await denied.text()).toContain('PERMISSION_DENIED');

    const deleted = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    expect(deleted.status, await deleted.text()).toBe(204);

    const row = await documentLifecycleRow(uploaded.documentId);
    expect(row).toMatchObject({
      status: 'deleted',
      deleted_by: '22222222-2222-4222-8222-222222222201',
      deleted_previous_status: 'draft',
      version_count: '1',
      file_object_count: '1',
    });
    expect(row?.deleted_at).toBeInstanceOf(Date);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_DELETED')).toBe(1);
    expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_DELETED')).toEqual({
      document_id: uploaded.documentId,
      matter_id: matterId,
      before_ref: 'document_status:draft',
      after_ref: 'document_status:deleted',
    });

    const memberRestore = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/restore`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie },
    });
    expect(memberRestore.status, await memberRestore.text()).toBe(403);

    const restored = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/restore`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
    });
    expect(restored.status, await restored.text()).toBe(204);
    expect(await documentLifecycleRow(uploaded.documentId)).toMatchObject({
      status: 'draft',
      deleted_at: null,
      deleted_by: null,
      deleted_previous_status: null,
      version_count: '1',
      file_object_count: '1',
    });
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_RESTORED')).toBe(1);
  });

  it('keeps physical document and file-object deletes scoped to records disposal only', () => {
    const matches = ['apps', 'packages'].flatMap(sourceFiles).flatMap((file) => {
      const text = readIfSmall(file);
      return /DELETE\s+FROM\s+(documents|file_objects)/i.test(text) ? [file] : [];
    });
    expect(matches).toEqual(['apps/api/src/modules/records/records.service.ts']);
    expect(readIfSmall('apps/api/src/modules/records/records.service.ts')).toContain(
      'app.records_disposal_executor',
    );
  });
});
