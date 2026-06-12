import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantAlphaId } from '../helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser, postSearch, type SearchHttpResponse } from './search-http-helpers';

describe('search filter endpoint permission integration', () => {
  const marker = `endpoint-filter-${randomUUID()}`;
  const hiddenMatterId = randomUUID();
  const hiddenClientId = randomUUID();
  const hiddenDocumentId = randomUUID();
  const hiddenTitle = `${marker} Hidden Merger Memo`;
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;

  beforeAll(async () => {
    const accessibleMatterId = randomUUID();
    const accessibleClientId = randomUUID();
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: accessibleClientId,
        matterId: accessibleMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: `${marker} Visible Merger Memo`,
        contentText: `${marker} visible authorized search text`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
      901,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: hiddenClientId,
        matterId: hiddenMatterId,
        documentId: hiddenDocumentId,
        versionId: randomUUID(),
        title: hiddenTitle,
        contentText: `${marker} hidden unauthorized search text`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
      902,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: accessibleMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
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

  it('does not expose hidden documents when matterId is attacker-supplied', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: marker,
      filters: { matterId: hiddenMatterId },
      page: 1,
      pageSize: 10,
    });

    expectZeroLeakage(response);
  });

  it('does not expose hidden facet counts when clientId is attacker-supplied', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: marker,
      filters: { clientId: hiddenClientId },
      page: 1,
      pageSize: 10,
    });

    expectZeroLeakage(response);
  });

  function expectZeroLeakage(response: SearchHttpResponse): void {
    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
    expect(response.facets).toEqual({
      clients: [],
      matters: [],
      documentTypes: [],
      versionStatuses: [],
      dateRanges: [],
    });
    const raw = JSON.stringify(response);
    expect(raw).not.toContain(hiddenMatterId);
    expect(raw).not.toContain(hiddenClientId);
    expect(raw).not.toContain(hiddenDocumentId);
    expect(raw).not.toContain(hiddenTitle);
  }
});
