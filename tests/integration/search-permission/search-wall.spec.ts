import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantAlphaId } from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaMemberUserId,
  alphaOwnerUserId,
  createEthicalWall,
  createGroupWithMember,
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

async function insertWallSearchRow(input: {
  matterId: string;
  title: string;
  token: string;
  index: number;
  documentId?: string;
}): Promise<string> {
  const documentId = input.documentId ?? randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: randomUUID(),
      matterId: input.matterId,
      documentId,
      versionId: randomUUID(),
      title: input.title,
      contentText: `${input.token} wall search text`,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-16T00:00:00.000Z',
    },
    input.index,
  );
  return documentId;
}

describe('search ethical wall filter integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
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

  it('blocks direct excluded users at query time', async () => {
    const matterId = randomUUID();
    const token = `directwallgate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertWallSearchRow({
      matterId,
      title: 'SP Wall Direct Excluded',
      token,
      index: 301,
    });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    const response = await postSearch(baseUrl, ownerCookie, { query: token });

    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
  });

  it('blocks group excluded users at query time', async () => {
    const matterId = randomUUID();
    const token = `groupwallgate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertWallSearchRow({
      matterId,
      title: 'SP Wall Group Excluded',
      token,
      index: 302,
    });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaMemberUserId });
    const groupId = await createGroupWithMember({
      tenantId: tenantAlphaId,
      userId: alphaMemberUserId,
    });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectType: 'group',
      subjectId: groupId,
      membershipType: 'excluded',
    });

    const response = await postSearch(baseUrl, memberCookie, { query: token });

    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
  });

  it('allows insiders and blocks non-insiders when an active wall has insiders', async () => {
    const matterId = randomUUID();
    const token = `insiderwallgate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await insertWallSearchRow({
      matterId,
      title: 'SP Wall Insider Visible',
      token,
      index: 303,
    });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaMemberUserId });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'insider',
    });

    const ownerResponse = await postSearch(baseUrl, ownerCookie, { query: token });
    const memberResponse = await postSearch(baseUrl, memberCookie, { query: token });

    expect(ownerResponse.total).toBe(1);
    expect(resultTitles(ownerResponse)).toEqual(['SP Wall Insider Visible']);
    expect(memberResponse.total).toBe(0);
  });

  it('lets wall exclusion override explicit document allow at query time', async () => {
    const matterId = randomUUID();
    const token = `explicitwallgate${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const documentId = await insertWallSearchRow({
      matterId,
      title: 'SP Wall Explicit Allow Hidden',
      token,
      index: 304,
    });
    await addMatterMember({ tenantId: tenantAlphaId, matterId, userId: alphaOwnerUserId });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: documentId,
      subjectId: alphaOwnerUserId,
      effect: 'ALLOW',
    });
    const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    const response = await postSearch(baseUrl, ownerCookie, { query: token });

    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
  });
});
