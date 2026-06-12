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
  createSearchFixture,
  insertSearchIndexedRow,
  removeMatterMember,
  type SearchFixture,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

describe('search permission matter filter integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let fixture: SearchFixture;
  let hiddenMatterId: string;

  beforeAll(async () => {
    fixture = await createSearchFixture('SP Matter');
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });

    hiddenMatterId = randomUUID();
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: fixture.alphaClientId,
        matterId: hiddenMatterId,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SP Matter Hidden Same Tenant',
        contentText: 'termination hidden same tenant matter',
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-14T00:00:00.000Z',
      },
      101,
    );

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

  it('injects matter membership before search ranking, snippets, and counts', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: 'termination',
      filters: { clientId: fixture.alphaClientId },
      pageSize: 10,
    });

    expect(response.total).toBe(2);
    expect(resultTitles(response)).toEqual([
      'SP Matter Termination Agreement',
      'SP Matter Background Memo',
    ]);
    expect(resultTitles(response)).not.toContain('SP Matter Hidden Same Tenant');
    expect(response.results.every((result) => result.matterId === fixture.alphaMatterId)).toBe(true);
  });

  it('applies membership removal on the next query without reindexing', async () => {
    await removeMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
      userId: alphaOwnerUserId,
    });

    const response = await postSearch(baseUrl, cookie, {
      query: 'termination',
      filters: { clientId: fixture.alphaClientId },
      pageSize: 10,
    });

    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
  });
});
