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
  alphaMemberUserId,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

describe('search ethical wall bidirectional integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let token: string;

  beforeAll(async () => {
    token = `bidirectionalwallgate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const matterA = randomUUID();
    const matterB = randomUUID();
    const clientId = randomUUID();
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId: matterA,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SP Wall Side A',
        contentText: `${token} side a`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-17T00:00:00.000Z',
      },
      401,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId: matterB,
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SP Wall Side B',
        contentText: `${token} side b`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-18T00:00:00.000Z',
      },
      402,
    );
    for (const matterId of [matterA, matterB]) {
      await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
      await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaMemberUserId });
    }

    const wallA = await createEthicalWall({ tenantId: tenantAlphaId, matterId: matterA });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId: wallA,
      subjectId: alphaOwnerUserId,
      membershipType: 'insider',
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId: wallA,
      subjectId: alphaMemberUserId,
      membershipType: 'excluded',
    });

    const wallB = await createEthicalWall({ tenantId: tenantAlphaId, matterId: matterB });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId: wallB,
      subjectId: alphaMemberUserId,
      membershipType: 'insider',
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId: wallB,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps opposing wall sides isolated for the same search query', async () => {
    const ownerResponse = await postSearch(baseUrl, ownerCookie, {
      query: token,
      pageSize: 10,
    });
    const memberResponse = await postSearch(baseUrl, memberCookie, {
      query: token,
      pageSize: 10,
    });

    expect(resultTitles(ownerResponse)).toEqual(['SP Wall Side A']);
    expect(resultTitles(memberResponse)).toEqual(['SP Wall Side B']);
  });
});
