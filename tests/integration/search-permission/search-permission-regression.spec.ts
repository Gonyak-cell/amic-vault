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
  addWallMembership,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  removeMatterMember,
} from './search-fixtures';
import { loginSearchUser, postSearch } from './search-http-helpers';

async function insertRegressionRow(input: {
  matterId: string;
  title: string;
  token: string;
  index: number;
}): Promise<void> {
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: randomUUID(),
      matterId: input.matterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: input.title,
      contentText: `${input.token} regression text`,
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-19T00:00:00.000Z',
    },
    input.index,
  );
}

describe('search permission regression integration', () => {
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

  it('honors membership removal on the immediate next query', async () => {
    const matterId = randomUUID();
    const token = `membershipregressiongate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertRegressionRow({
      matterId,
      title: 'SP Regression Membership',
      token,
      index: 501,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });

    const before = await postSearch(baseUrl, cookie, { query: token });
    await removeMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    const after = await postSearch(baseUrl, cookie, { query: token });

    expect(before.total).toBe(1);
    expect(after.total).toBe(0);
  });

  it('honors newly added walls on the immediate next query without reindexing', async () => {
    const matterId = randomUUID();
    const token = `wallregressiongate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertRegressionRow({
      matterId,
      title: 'SP Regression Wall',
      token,
      index: 502,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });

    const before = await postSearch(baseUrl, cookie, { query: token });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });
    const after = await postSearch(baseUrl, cookie, { query: token });

    expect(before.total).toBe(1);
    expect(after.total).toBe(0);
  });
});
