import { describe, expect, it } from 'vitest';
import type { ClientDto, MatterListDto } from '@amic-vault/shared';
import { ApiClientError } from '@/lib/api-client';
import { loadClientDetailSections, type ClientDetailSectionUpdate } from './client-detail-load';

describe('loadClientDetailSections', () => {
  it('publishes a successful client independently when the Matter request fails', async () => {
    const updates: ClientDetailSectionUpdate[] = [];

    loadClientDetailSections(
      clientFixture.clientId,
      {
        getClient: async () => clientFixture,
        listMatters: async () => {
          throw new Error('Matter transport failed');
        },
      },
      (update) => updates.push(update),
    );

    await flushPromises();

    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({
      client: clientFixture,
      loadState: 'ready',
      section: 'client',
    });
    expect(updates[1]).toMatchObject({
      loadState: 'unavailable',
      matters: [],
      matterPage: undefined,
      matterTotalCount: undefined,
      section: 'portfolio',
    });
  });

  it('maps an API permission denial without hiding the successful client section', async () => {
    const updates: ClientDetailSectionUpdate[] = [];

    loadClientDetailSections(
      clientFixture.clientId,
      {
        getClient: async () => clientFixture,
        listMatters: async () => {
          throw new ApiClientError(403, { code: 'PERMISSION_DENIED' });
        },
      },
      (update) => updates.push(update),
    );

    await flushPromises();

    expect(updates.map((update) => update.loadState)).toEqual(['ready', 'forbidden']);
    expect(updates[0]?.section).toBe('client');
    expect(updates[1]?.section).toBe('portfolio');
  });

  it('ignores stale client and Matter results after a newer load cancels the first one', async () => {
    const updates: ClientDetailSectionUpdate[] = [];
    const firstClient = deferred<ClientDto>();
    const firstMatters = deferred<MatterListDto>();
    const secondClient = deferred<ClientDto>();
    const secondMatters = deferred<MatterListDto>();

    const cancelFirst = loadClientDetailSections(
      clientFixture.clientId,
      {
        getClient: () => firstClient.promise,
        listMatters: () => firstMatters.promise,
      },
      (update) => updates.push(update),
    );
    loadClientDetailSections(
      clientFixture.clientId,
      {
        getClient: () => secondClient.promise,
        listMatters: () => secondMatters.promise,
      },
      (update) => updates.push(update),
    );

    cancelFirst();
    firstClient.resolve(clientFixture);
    firstMatters.resolve(emptyMatterList);
    secondClient.resolve(clientFixture);
    secondMatters.reject(new Error('second Matter transport failed'));

    await flushPromises();

    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ loadState: 'ready', section: 'client' });
    expect(updates[1]).toMatchObject({
      loadState: 'unavailable',
      section: 'portfolio',
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

const emptyMatterList: MatterListDto = {
  items: [],
  page: 1,
  pageSize: 100,
  totalCount: 0,
};

const clientFixture: ClientDto = {
  aliases: [],
  clientId: '11111111-1111-4111-8111-111111111111',
  clientType: 'corporation',
  confidentialityLevel: 'standard',
  createdAt: '2026-07-02T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111112',
  displayName: '한빛전자',
  metadata: {},
  name: '한빛전자',
  status: 'active',
  tenantId: '11111111-1111-4111-8111-111111111100',
  updatedAt: '2026-07-02T00:00:00.000Z',
};
