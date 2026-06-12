import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  removeMatterMember,
} from './search-fixtures';
import { loginSearchUser, postSearch } from './search-http-helpers';

describe('search permission SLA integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;

  beforeAll(async () => {
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

  it('keeps permission enforcement independent of index row mutation', async () => {
    const matterId = randomUUID();
    const versionId = randomUUID();
    const token = `slapermissiongate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: randomUUID(),
        matterId,
        documentId: randomUUID(),
        versionId,
        title: 'SP SLA No Reindex',
        contentText: `${token} stable indexed text`,
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
      601,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const indexedAtBefore = await indexTimestamp(versionId);

    const before = await postSearch(baseUrl, cookie, { query: token });
    await removeMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    const after = await postSearch(baseUrl, cookie, { query: token });
    const indexedAtAfter = await indexTimestamp(versionId);

    expect(before.total).toBe(1);
    expect(after.total).toBe(0);
    expect(indexedAtAfter).toEqual(indexedAtBefore);
  });
});

async function indexTimestamp(versionId: string): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ indexed_at: Date }>(
      `
        SELECT indexed_at
        FROM document_search_index
        WHERE version_id = $1
        LIMIT 1
      `,
      [versionId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0]!.indexed_at.toISOString();
  });
}
