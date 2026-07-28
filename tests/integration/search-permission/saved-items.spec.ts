import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { SavedItemDto, SavedItemListDto, SavedSearchDto } from '@amic-vault/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from '../helpers/db';
import {
  addMatterMember,
  alphaMemberUserId,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  removeMatterMember,
} from './search-fixtures';
import { loginSearchUser } from './search-http-helpers';

interface Fixture {
  clientId: string;
  documentId: string;
  matterId: string;
  savedItemIds: string[];
  savedSearchId: string | null;
}

async function requestJson<T>(
  baseUrl: string,
  cookie: string,
  path: string,
  init: RequestInit = {},
): Promise<{ body: T; status: number }> {
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
    body: (text ? JSON.parse(text) : undefined) as T,
    status: response.status,
  };
}

describe('personal saved items integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaCookie: string;
  let betaCookie: string;
  const fixture: Fixture = {
    clientId: randomUUID(),
    documentId: randomUUID(),
    matterId: randomUUID(),
    savedItemIds: [],
    savedSearchId: null,
  };

  beforeAll(async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: fixture.clientId,
        matterId: fixture.matterId,
        documentId: fixture.documentId,
        versionId: randomUUID(),
        title: 'WB03 Personal Saved Item',
        contentText: 'wb03 personal saved item permission fixture',
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
      210,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.matterId,
      userId: alphaMemberUserId,
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    betaCookie = await loginSearchUser(baseUrl, {
      tenantId: '22222222-2222-4222-8222-222222222222',
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
  });

  afterAll(async () => {
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.matterId,
      userId: alphaMemberUserId,
    });
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          DELETE FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
            AND target_id = ANY($3::uuid[])
        `,
        [
          tenantAlphaId,
          alphaMemberUserId,
          [fixture.documentId, fixture.matterId, fixture.savedSearchId].filter(Boolean),
        ],
      );
    });
    await app.close();
  });

  it('serializes concurrent duplicate adds into one preference and one add audit', async () => {
    const request = () =>
      requestJson<SavedItemDto>(baseUrl, alphaCookie, '/v1/saved-items', {
        method: 'POST',
        body: JSON.stringify({ targetType: 'document', targetId: fixture.documentId }),
      });
    const [first, second] = await Promise.all([request(), request()]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.savedItemId).toBe(second.body.savedItemId);
    fixture.savedItemIds.push(first.body.savedItemId);

    const auditCount = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'SAVED_ITEM_ADDED'
            AND target_id = $2
        `,
        [tenantAlphaId, first.body.savedItemId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
    expect(auditCount).toBe(1);
  });

  it('supports Matter and personal saved-search targets but rejects cross-tenant targets', async () => {
    const matter = await requestJson<SavedItemDto>(baseUrl, alphaCookie, '/v1/saved-items', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'matter', targetId: fixture.matterId }),
    });
    expect(matter.status).toBe(201);
    fixture.savedItemIds.push(matter.body.savedItemId);

    const savedSearch = await requestJson<SavedSearchDto>(
      baseUrl,
      alphaCookie,
      '/v1/search/saved-searches',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `WB03 ${randomUUID().slice(0, 8)}`,
          scope: 'personal',
          query: { query: 'wb03', page: 1, pageSize: 10 },
        }),
      },
    );
    expect(savedSearch.status).toBe(201);
    fixture.savedSearchId = savedSearch.body.savedSearchId;

    const searchPin = await requestJson<SavedItemDto>(
      baseUrl,
      alphaCookie,
      '/v1/saved-items',
      {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'saved_search',
          targetId: savedSearch.body.savedSearchId,
        }),
      },
    );
    expect(searchPin.status).toBe(201);
    fixture.savedItemIds.push(searchPin.body.savedItemId);

    const crossTenant = await requestJson<unknown>(baseUrl, betaCookie, '/v1/saved-items', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'document', targetId: fixture.documentId }),
    });
    expect(crossTenant.status).toBe(403);

    const rlsCount = await withClient(createAppClient(), async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `SELECT set_config('app.current_tenant_id', '22222222-2222-4222-8222-222222222222', true)`,
        );
        const result = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
            FROM saved_items
            WHERE tenant_id = $1
              AND saved_item_id = ANY($2::uuid[])
          `,
          [tenantAlphaId, fixture.savedItemIds],
        );
        await client.query('COMMIT');
        return Number(result.rows[0]?.count ?? 0);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    expect(rlsCount).toBe(0);
  });

  it('serializes concurrent exact-set reorders and rejects incomplete orders', async () => {
    const forward = [...fixture.savedItemIds];
    const reverse = [...fixture.savedItemIds].reverse();
    const reorder = (savedItemIds: string[]) =>
      requestJson<void>(baseUrl, alphaCookie, '/v1/saved-items/order', {
        method: 'PUT',
        body: JSON.stringify({ savedItemIds }),
      });

    const [first, second] = await Promise.all([reorder(forward), reorder(reverse)]);
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const listed = await requestJson<SavedItemListDto>(
      baseUrl,
      alphaCookie,
      '/v1/saved-items',
    );
    const listedOrder = listed.body.items.map((item) => item.savedItemId);
    expect([forward, reverse]).toContainEqual(listedOrder);

    const incomplete = await reorder(fixture.savedItemIds.slice(1));
    expect(incomplete.status).toBe(400);
  });

  it('removes revoked and stale targets at query time without exposing their references', async () => {
    const beforeRevoke = await requestJson<SavedItemListDto>(
      baseUrl,
      alphaCookie,
      '/v1/saved-items',
    );
    const matterPreference = beforeRevoke.body.items.find(
      (item) => item.targetType === 'matter',
    );
    if (!matterPreference) throw new Error('matter preference fixture is missing');
    const explicitRemove = await requestJson<void>(
      baseUrl,
      alphaCookie,
      `/v1/saved-items/${matterPreference.savedItemId}`,
      { method: 'DELETE' },
    );
    expect(explicitRemove.status).toBe(204);

    await removeMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.matterId,
      userId: alphaMemberUserId,
    });
    if (!fixture.savedSearchId) throw new Error('saved search fixture is missing');
    const revoked = await requestJson<void>(
      baseUrl,
      alphaCookie,
      `/v1/search/saved-searches/${fixture.savedSearchId}`,
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(204);

    const listed = await requestJson<SavedItemListDto>(
      baseUrl,
      alphaCookie,
      '/v1/saved-items',
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([]);

    const storedCount = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM saved_items
          WHERE tenant_id = $1
            AND saved_item_id = ANY($2::uuid[])
        `,
        [tenantAlphaId, fixture.savedItemIds],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
    expect(storedCount).toBe(0);

    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.matterId,
      userId: alphaMemberUserId,
    });
  });

  it('records one add and one explicit-or-stale removal for each preference', async () => {
    const actionCounts = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ action: string; count: string }>(
        `
          SELECT action, count(*)::text AS count
          FROM audit_events
          WHERE tenant_id = $1
            AND target_id = ANY($2::uuid[])
            AND action IN ('SAVED_ITEM_ADDED', 'SAVED_ITEM_REMOVED')
          GROUP BY action
        `,
        [tenantAlphaId, fixture.savedItemIds],
      );
      return new Map(result.rows.map((row) => [row.action, Number(row.count)]));
    });
    expect(actionCounts.get('SAVED_ITEM_ADDED')).toBe(3);
    expect(actionCounts.get('SAVED_ITEM_REMOVED')).toBe(3);
  });
});
