import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantAlphaId } from '../helpers/db';
import { addMatterMember, alphaOwnerUserId, insertSearchIndexedRow } from './search-fixtures';
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
        confidentialityLevel: 'restricted',
        documentType: 'memo',
        documentStatus: 'draft',
        privilegeStatus: 'privileged',
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

  it('does not expose hidden documents when confidentiality filters only match hidden rows', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: marker,
      filters: { confidentialityLevel: 'restricted' },
      page: 1,
      pageSize: 10,
    });

    expectZeroLeakage(response);
  });

  it('does not expose hidden documents when privilege filters only match hidden rows', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: marker,
      filters: { privilegeStatus: 'privileged' },
      page: 1,
      pageSize: 10,
    });

    expectZeroLeakage(response);
  });

  it('saves and replays hybrid search mode through saved-search endpoints', async () => {
    const saveResponse = await fetch(`${baseUrl}/v1/search/saved-searches`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Hybrid endpoint filter',
        query: {
          mode: 'hybrid',
          query: marker,
          filters: { clientId: hiddenClientId },
          page: 1,
          pageSize: 10,
        },
        scope: 'personal',
      }),
    });
    const savedText = await saveResponse.text();
    expect(saveResponse.status, savedText).toBe(201);
    const saved = JSON.parse(savedText) as { savedSearchId: string; query: { mode?: string } };
    expect(saved.query.mode).toBe('hybrid');

    const openResponse = await fetch(
      `${baseUrl}/v1/search/saved-searches/${saved.savedSearchId}/open`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
      },
    );
    const openedText = await openResponse.text();
    expect(openResponse.status, openedText).toBe(201);
    const opened = JSON.parse(openedText) as {
      query: { filters?: { clientId?: string }; mode?: string; query?: string };
    };
    expect(opened.query).toMatchObject({
      filters: { clientId: hiddenClientId },
      mode: 'hybrid',
      query: marker,
    });

    const listResponse = await fetch(`${baseUrl}/v1/search/saved-searches`, {
      headers: { cookie },
    });
    const listText = await listResponse.text();
    expect(listResponse.status, listText).toBe(200);
    const listed = JSON.parse(listText) as { items: Array<{ savedSearchId: string }> };
    expect(listed.items).toContainEqual(expect.objectContaining({ savedSearchId: saved.savedSearchId }));

    const deleteResponse = await fetch(
      `${baseUrl}/v1/search/saved-searches/${saved.savedSearchId}`,
      {
        method: 'DELETE',
        headers: { cookie },
      },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await fetch(`${baseUrl}/v1/search/saved-searches`, {
      headers: { cookie },
    });
    const afterDeleteText = await afterDeleteResponse.text();
    expect(afterDeleteResponse.status, afterDeleteText).toBe(200);
    const afterDelete = JSON.parse(afterDeleteText) as {
      items: Array<{ savedSearchId: string }>;
    };
    expect(afterDelete.items).not.toContainEqual(
      expect.objectContaining({ savedSearchId: saved.savedSearchId }),
    );
  });

  function expectZeroLeakage(response: SearchHttpResponse): void {
    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
    expect(response.facets).toEqual({
      clients: [],
      matters: [],
      documentTypes: [],
      confidentialityLevels: [],
      extractionStatuses: [],
      emailRecipientDomains: [],
      emailSenderDomains: [],
      ocrConfidence: [],
      legalHolds: [],
      privilegeStatuses: [],
      recordsStatuses: [],
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
