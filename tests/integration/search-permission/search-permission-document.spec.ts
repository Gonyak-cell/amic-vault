import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { DocumentPermissionService } from '../../../apps/api/src/modules/permission/document-permission.service';
import { tenantAlphaId } from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  setDocumentSecurity,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

interface DocumentFixture {
  token: string;
  matterId: string;
  standardDocumentId: string;
  highAllowedDocumentId: string;
  highHiddenDocumentId: string;
  deniedDocumentId: string;
  conditionalAllowedDocumentId: string;
}

async function insertDocumentRow(input: {
  matterId: string;
  clientId: string;
  documentId: string;
  title: string;
  token: string;
  index: number;
}): Promise<void> {
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId: input.documentId,
      versionId: randomUUID(),
      title: input.title,
      contentText: `${input.token} privileged search text`,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
    input.index,
  );
}

describe('search permission document filter integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let fixture: DocumentFixture;

  beforeAll(async () => {
    const clientId = randomUUID();
    const matterId = randomUUID();
    fixture = {
      token: `docgate${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      matterId,
      standardDocumentId: randomUUID(),
      highAllowedDocumentId: randomUUID(),
      highHiddenDocumentId: randomUUID(),
      deniedDocumentId: randomUUID(),
      conditionalAllowedDocumentId: randomUUID(),
    };
    await insertDocumentRow({
      matterId,
      clientId,
      documentId: fixture.standardDocumentId,
      title: 'SP Document Standard Visible',
      token: fixture.token,
      index: 201,
    });
    await insertDocumentRow({
      matterId,
      clientId,
      documentId: fixture.highAllowedDocumentId,
      title: 'SP Document High Explicit Allow',
      token: fixture.token,
      index: 202,
    });
    await insertDocumentRow({
      matterId,
      clientId,
      documentId: fixture.highHiddenDocumentId,
      title: 'SP Document High Hidden',
      token: fixture.token,
      index: 203,
    });
    await insertDocumentRow({
      matterId,
      clientId,
      documentId: fixture.deniedDocumentId,
      title: 'SP Document Explicit Deny',
      token: fixture.token,
      index: 204,
    });
    await insertDocumentRow({
      matterId,
      clientId,
      documentId: fixture.conditionalAllowedDocumentId,
      title: 'SP Document Conditional Allow Hidden',
      token: fixture.token,
      index: 205,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await setDocumentSecurity({
      tenantId: tenantAlphaId,
      documentId: fixture.highAllowedDocumentId,
      confidentialityLevel: 'high',
    });
    await setDocumentSecurity({
      tenantId: tenantAlphaId,
      documentId: fixture.highHiddenDocumentId,
      confidentialityLevel: 'high',
    });
    await setDocumentSecurity({
      tenantId: tenantAlphaId,
      documentId: fixture.conditionalAllowedDocumentId,
      confidentialityLevel: 'high',
      privilegeStatus: 'privileged',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: fixture.highAllowedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'ALLOW',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: fixture.deniedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: fixture.conditionalAllowedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'ALLOW',
      conditionJson: { after_hours: true },
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('injects document-level deny, confidentiality, and condition fail-closed filters', async () => {
    const response = await postSearch(baseUrl, cookie, { query: fixture.token, pageSize: 10 });

    expect(response.total).toBe(2);
    expect(resultTitles(response).sort()).toEqual([
      'SP Document High Explicit Allow',
      'SP Document Standard Visible',
    ].sort());
    expect(resultTitles(response)).not.toContain('SP Document High Hidden');
    expect(resultTitles(response)).not.toContain('SP Document Explicit Deny');
    expect(resultTitles(response)).not.toContain('SP Document Conditional Allow Hidden');
  });

  it('matches document PermissionService for non-conditional read decisions', async () => {
    const service = app.get(DocumentPermissionService);
    const checks = await Promise.all([
      service.canReadDocument(
        { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
        fixture.standardDocumentId,
      ),
      service.canReadDocument(
        { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
        fixture.highAllowedDocumentId,
      ),
      service.canReadDocument(
        { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
        fixture.highHiddenDocumentId,
      ),
      service.canReadDocument(
        { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
        fixture.deniedDocumentId,
      ),
    ]);
    const allowedIds = [
      fixture.standardDocumentId,
      fixture.highAllowedDocumentId,
      fixture.highHiddenDocumentId,
      fixture.deniedDocumentId,
    ].filter((_documentId, index) => checks[index]?.effect === 'ALLOW');
    const response = await postSearch(baseUrl, cookie, { query: fixture.token, pageSize: 10 });

    expect(response.results.map((result) => result.documentId).sort()).toEqual(allowedIds.sort());
  });
});
