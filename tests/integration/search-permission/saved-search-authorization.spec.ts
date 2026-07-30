import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { SavedSearchDto, SavedSearchListDto } from '@amic-vault/shared';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaFirmAdminUserId,
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

async function saveMatterBoundSearch(
  baseUrl: string,
  cookie: string,
  matterId: string,
  name: string,
  scope: 'personal' | 'matter-team' | 'admin-shared',
): Promise<HttpResult<SavedSearchDto>> {
  return requestJson<SavedSearchDto>(baseUrl, cookie, '/v1/search/saved-searches', {
    method: 'POST',
    body: JSON.stringify({
      ...(scope === 'matter-team' ? { matterId } : {}),
      name,
      query: {
        filters: { matterId },
        page: 1,
        pageSize: 10,
        query: 'saved authorization',
      },
      scope,
    }),
  });
}

async function insertLegacySavedSearch(input: {
  matterId: string | null;
  name: string;
  queryMatterId: string;
  scope: 'personal' | 'matter-team' | 'admin-shared';
  userId: string;
}): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ saved_search_id: string }>(
      `
        INSERT INTO saved_searches (
          tenant_id,
          user_id,
          name,
          scope_type,
          matter_id,
          search_query_json,
          query_hash,
          filter_refs
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        RETURNING saved_search_id
      `,
      [
        tenantAlphaId,
        input.userId,
        input.name,
        input.scope,
        input.matterId,
        JSON.stringify({
          filters: { matterId: input.queryMatterId },
          page: 1,
          pageSize: 10,
          query: 'legacy saved authorization',
        }),
        '0'.repeat(64),
        `matter_id:${input.queryMatterId}`.slice(0, 256),
      ],
    );
    const savedSearchId = result.rows[0]?.saved_search_id;
    if (!savedSearchId) throw new Error('legacy saved-search insert returned no row');
    return savedSearchId;
  });
}

const denyScenarios = [
  {
    index: 980,
    label: 'explicit DENY',
    apply: async (matterId: string, blockedUserIds: readonly string[]) => {
      for (const userId of blockedUserIds) {
        await addExplicitPermission({
          tenantId: tenantAlphaId,
          resourceType: 'matter',
          resourceId: matterId,
          subjectId: userId,
          effect: 'DENY',
        });
      }
    },
  },
  {
    index: 981,
    label: 'excluded Ethical Wall',
    apply: async (matterId: string, blockedUserIds: readonly string[]) => {
      const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
      for (const userId of blockedUserIds) {
        await addWallMembership({
          tenantId: tenantAlphaId,
          wallId,
          subjectId: userId,
          membershipType: 'excluded',
        });
      }
    },
  },
  {
    index: 982,
    label: 'insider-required Ethical Wall',
    apply: async (matterId: string, blockedUserIds: readonly string[]) => {
      const wallId = await createEthicalWall({ tenantId: tenantAlphaId, matterId });
      const insiderUserId = [alphaOwnerUserId, alphaMemberUserId].find(
        (userId) => !blockedUserIds.includes(userId),
      );
      if (!insiderUserId) throw new Error('insider-required scenario needs an allowed user');
      await addWallMembership({
        tenantId: tenantAlphaId,
        wallId,
        subjectId: insiderUserId,
        membershipType: 'insider',
      });
    },
  },
] as const;

describe('saved-search Matter authorization integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let adminCookie: string;
  let memberCookie: string;

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
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
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

  it.each(denyScenarios)(
    'blocks Matter-team list, open, revoke, and save after $label is applied',
    async ({ apply, index, label }) => {
      const matterId = randomUUID();
      await seedReadableMatter(matterId, index);

      const original = await saveMatterBoundSearch(
        baseUrl,
        cookie,
        matterId,
        `Before ${label} ${randomUUID()}`,
        'matter-team',
      );
      expect(original.status, original.text).toBe(201);

      await apply(matterId, [alphaOwnerUserId]);

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

      const save = await saveMatterBoundSearch(
        baseUrl,
        cookie,
        matterId,
        `After ${label} ${randomUUID()}`,
        'matter-team',
      );
      expect(save.status, save.text).toBe(403);
      expect((save.body as unknown as { code?: string }).code).toBe('PERMISSION_DENIED');
    },
  );

  it.each(denyScenarios)(
    'blocks personal API and legacy query-only rows after $label is applied',
    async ({ apply, index, label }) => {
      const matterId = randomUUID();
      await seedReadableMatter(matterId, index + 10);

      const current = await saveMatterBoundSearch(
        baseUrl,
        cookie,
        matterId,
        `Personal before ${label} ${randomUUID().slice(0, 8)}`,
        'personal',
      );
      expect(current.status, current.text).toBe(201);
      const legacyId = await insertLegacySavedSearch({
        matterId: null,
        name: `Legacy personal ${label} ${randomUUID().slice(0, 8)}`,
        queryMatterId: matterId,
        scope: 'personal',
        userId: alphaOwnerUserId,
      });

      await apply(matterId, [alphaOwnerUserId]);

      const list = await requestJson<SavedSearchListDto>(
        baseUrl,
        cookie,
        '/v1/search/saved-searches',
      );
      expect(list.status, list.text).toBe(200);
      expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(
        current.body.savedSearchId,
      );
      expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(legacyId);
      expect(list.text).not.toContain(matterId);

      for (const savedSearchId of [current.body.savedSearchId, legacyId]) {
        const open = await requestJson<{ code?: string }>(
          baseUrl,
          cookie,
          `/v1/search/saved-searches/${savedSearchId}/open`,
          { method: 'POST' },
        );
        expect(open.status, open.text).toBe(403);
        expect(open.body.code).toBe('PERMISSION_DENIED');

        const revoke = await requestJson<{ code?: string }>(
          baseUrl,
          cookie,
          `/v1/search/saved-searches/${savedSearchId}`,
          { method: 'DELETE' },
        );
        expect(revoke.status, revoke.text).toBe(403);
        expect(revoke.body.code).toBe('PERMISSION_DENIED');
      }

      const save = await saveMatterBoundSearch(
        baseUrl,
        cookie,
        matterId,
        `Personal after ${label} ${randomUUID().slice(0, 8)}`,
        'personal',
      );
      expect(save.status, save.text).toBe(403);
      expect((save.body as unknown as { code?: string }).code).toBe('PERMISSION_DENIED');
    },
  );

  it.each(denyScenarios)(
    'blocks admin-shared rows for their creator and ordinary members after $label is applied',
    async ({ apply, index, label }) => {
      const matterId = randomUUID();
      await seedReadableMatter(matterId, index + 20);
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId,
        userId: alphaFirmAdminUserId,
      });
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId,
        userId: alphaMemberUserId,
      });

      const current = await saveMatterBoundSearch(
        baseUrl,
        adminCookie,
        matterId,
        `Admin shared before ${label} ${randomUUID().slice(0, 8)}`,
        'admin-shared',
      );
      expect(current.status, current.text).toBe(201);
      const legacyId = await insertLegacySavedSearch({
        matterId: null,
        name: `Legacy admin shared ${label} ${randomUUID().slice(0, 8)}`,
        queryMatterId: matterId,
        scope: 'admin-shared',
        userId: alphaFirmAdminUserId,
      });

      const memberListBefore = await requestJson<SavedSearchListDto>(
        baseUrl,
        memberCookie,
        '/v1/search/saved-searches',
      );
      expect(memberListBefore.status, memberListBefore.text).toBe(200);
      expect(memberListBefore.body.items.map((item) => item.savedSearchId)).toEqual(
        expect.arrayContaining([current.body.savedSearchId, legacyId]),
      );

      await apply(matterId, [alphaFirmAdminUserId, alphaMemberUserId]);

      for (const actorCookie of [adminCookie, memberCookie]) {
        const list = await requestJson<SavedSearchListDto>(
          baseUrl,
          actorCookie,
          '/v1/search/saved-searches',
        );
        expect(list.status, list.text).toBe(200);
        expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(
          current.body.savedSearchId,
        );
        expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(legacyId);
        expect(list.text).not.toContain(matterId);

        for (const savedSearchId of [current.body.savedSearchId, legacyId]) {
          const open = await requestJson<{ code?: string }>(
            baseUrl,
            actorCookie,
            `/v1/search/saved-searches/${savedSearchId}/open`,
            { method: 'POST' },
          );
          expect(open.status, open.text).toBe(403);
          expect(open.body.code).toBe('PERMISSION_DENIED');
        }
      }

      for (const savedSearchId of [current.body.savedSearchId, legacyId]) {
        const revoke = await requestJson<{ code?: string }>(
          baseUrl,
          adminCookie,
          `/v1/search/saved-searches/${savedSearchId}`,
          { method: 'DELETE' },
        );
        expect(revoke.status, revoke.text).toBe(403);
        expect(revoke.body.code).toBe('PERMISSION_DENIED');
      }

      const save = await saveMatterBoundSearch(
        baseUrl,
        adminCookie,
        matterId,
        `Admin shared after ${label} ${randomUUID().slice(0, 8)}`,
        'admin-shared',
      );
      expect(save.status, save.text).toBe(403);
      expect((save.body as unknown as { code?: string }).code).toBe('PERMISSION_DENIED');
    },
  );

  it('fails closed for malformed and mismatched legacy Matter references', async () => {
    const persistedMatterId = randomUUID();
    const queryMatterId = randomUUID();
    await seedReadableMatter(persistedMatterId, 1030);
    await seedReadableMatter(queryMatterId, 1031);
    for (const matterId of [persistedMatterId, queryMatterId]) {
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId,
        userId: alphaFirmAdminUserId,
      });
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId,
        userId: alphaMemberUserId,
      });
    }

    const malformedPersonalId = await insertLegacySavedSearch({
      matterId: null,
      name: `Malformed personal ${randomUUID()}`,
      queryMatterId: 'not-a-uuid',
      scope: 'personal',
      userId: alphaOwnerUserId,
    });
    const malformedAdminSharedId = await insertLegacySavedSearch({
      matterId: null,
      name: `Malformed admin shared ${randomUUID()}`,
      queryMatterId: 'still-not-a-uuid',
      scope: 'admin-shared',
      userId: alphaFirmAdminUserId,
    });
    const mismatchedPersonalId = await insertLegacySavedSearch({
      matterId: persistedMatterId,
      name: `Mismatched personal ${randomUUID()}`,
      queryMatterId,
      scope: 'personal',
      userId: alphaOwnerUserId,
    });
    const mismatchedAdminSharedId = await insertLegacySavedSearch({
      matterId: persistedMatterId,
      name: `Mismatched admin shared ${randomUUID()}`,
      queryMatterId,
      scope: 'admin-shared',
      userId: alphaFirmAdminUserId,
    });
    const allInvalidIds = [
      malformedPersonalId,
      malformedAdminSharedId,
      mismatchedPersonalId,
      mismatchedAdminSharedId,
    ];

    for (const actorCookie of [cookie, adminCookie, memberCookie]) {
      const list = await requestJson<SavedSearchListDto>(
        baseUrl,
        actorCookie,
        '/v1/search/saved-searches',
      );
      expect(list.status, list.text).toBe(200);
      for (const savedSearchId of allInvalidIds) {
        expect(list.body.items.map((item) => item.savedSearchId)).not.toContain(savedSearchId);
      }
      expect(list.text).not.toContain('not-a-uuid');
      expect(list.text).not.toContain(queryMatterId);
    }

    const actorCases = [
      { actorCookie: cookie, savedSearchId: malformedPersonalId },
      { actorCookie: cookie, savedSearchId: mismatchedPersonalId },
      { actorCookie: adminCookie, savedSearchId: malformedAdminSharedId },
      { actorCookie: adminCookie, savedSearchId: mismatchedAdminSharedId },
      { actorCookie: memberCookie, savedSearchId: malformedAdminSharedId },
      { actorCookie: memberCookie, savedSearchId: mismatchedAdminSharedId },
    ];
    for (const { actorCookie, savedSearchId } of actorCases) {
      const open = await requestJson<{ code?: string }>(
        baseUrl,
        actorCookie,
        `/v1/search/saved-searches/${savedSearchId}/open`,
        { method: 'POST' },
      );
      expect(open.status, open.text).toBe(403);
      expect(open.body.code).toBe('PERMISSION_DENIED');
    }

    for (const savedSearchId of allInvalidIds) {
      const actorCookie = [malformedPersonalId, mismatchedPersonalId].includes(savedSearchId)
        ? cookie
        : adminCookie;
      const revoke = await requestJson<{ code?: string }>(
        baseUrl,
        actorCookie,
        `/v1/search/saved-searches/${savedSearchId}`,
        { method: 'DELETE' },
      );
      expect(revoke.status, revoke.text).toBe(403);
      expect(revoke.body.code).toBe('PERMISSION_DENIED');
    }
  });
});
