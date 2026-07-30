import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { SavedSearchDto, SavedSearchListDto } from '@amic-vault/shared';
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
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser } from './search-http-helpers';

interface HttpResult<T> {
  body: T;
  status: number;
  text: string;
}

async function requestJson<T>(
  baseUrl: string,
  cookie: string,
  path: string,
  init: RequestInit = {},
): Promise<HttpResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  return {
    body: text ? (JSON.parse(text) as T) : (undefined as T),
    status: response.status,
    text,
  };
}

async function seedReadableMatter(matterId: string, index: number): Promise<void> {
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: randomUUID(),
      matterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `Saved search authorization ${index}`,
      contentText: `saved search authorization fixture ${index}`,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
    index,
  );
  await addMatterMember({
    tenantId: tenantAlphaId,
    matterId,
    userId: alphaOwnerUserId,
    matterRole: 'owner',
    accessLevel: 'edit',
  });
}

async function saveMatterTeamSearch(
  baseUrl: string,
  cookie: string,
  matterId: string,
  name: string,
): Promise<HttpResult<SavedSearchDto>> {
  return requestJson<SavedSearchDto>(baseUrl, cookie, '/v1/search/saved-searches', {
    method: 'POST',
    body: JSON.stringify({
      matterId,
      name,
      query: {
        filters: { matterId },
        page: 1,
        pageSize: 10,
        query: 'saved authorization',
      },
      scope: 'matter-team',
    }),
  });
}

const denyScenarios = [
  {
    index: 980,
    label: 'explicit DENY',
    apply: (matterId: string) =>
      addExplicitPermission({
        tenantId: tenantAlphaId,
        resourceType: 'matter',
        resourceId: matterId,
        subjectId: alphaOwnerUserId,
        effect: 'DENY',
      }),
  },
  {
    index: 981,
    label: 'excluded Ethical Wall',
    apply: async (matterId: string) => {
      const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
      await addWallMembership({
        tenantId: tenantAlphaId,
        wallId,
        subjectId: alphaOwnerUserId,
        membershipType: 'excluded',
      });
    },
  },
  {
    index: 982,
    label: 'insider-required Ethical Wall',
    apply: async (matterId: string) => {
      const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
      await addWallMembership({
        tenantId: tenantAlphaId,
        wallId,
        subjectId: alphaMemberUserId,
        membershipType: 'insider',
      });
    },
  },
] as const;

describe('saved-search Matter authorization integration', () => {
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

  it.each(denyScenarios)(
    'blocks list, open, and save after $label is applied',
    async ({ apply, index, label }) => {
      const matterId = randomUUID();
      await seedReadableMatter(matterId, index);

      const original = await saveMatterTeamSearch(
        baseUrl,
        cookie,
        matterId,
        `Before ${label} ${randomUUID()}`,
      );
      expect(original.status, original.text).toBe(201);

      await apply(matterId);

      const list = await requestJson<SavedSearchListDto>(
        baseUrl,
        cookie,
        '/v1/search/saved-searches',
      );
      expect(list.status, list.text).toBe(200);
      expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(
        original.body.savedSearchId,
      );

      const open = await requestJson<{ code?: string }>(
        baseUrl,
        cookie,
        `/v1/search/saved-searches/${original.body.savedSearchId}/open`,
        { method: 'POST' },
      );
      expect(open.status, open.text).toBe(403);
      expect(open.body.code).toBe('PERMISSION_DENIED');

      const revoke = await requestJson<{ code?: string }>(
        baseUrl,
        cookie,
        `/v1/search/saved-searches/${original.body.savedSearchId}`,
        { method: 'DELETE' },
      );
      expect(revoke.status, revoke.text).toBe(403);
      expect(revoke.body.code).toBe('PERMISSION_DENIED');

      const save = await saveMatterTeamSearch(
        baseUrl,
        cookie,
        matterId,
        `After ${label} ${randomUUID()}`,
      );
      expect(save.status, save.text).toBe(403);
      expect((save.body as unknown as { code?: string }).code).toBe('PERMISSION_DENIED');
    },
  );
});
