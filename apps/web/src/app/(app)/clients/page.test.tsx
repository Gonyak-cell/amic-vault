import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClientDto, ClientListDto } from '@amic-vault/shared';
import {
  buildCreateClientInput,
  parseClientAliases,
  prependCreatedClient,
} from './client-create-contract';
import {
  clientDialogFocusTarget,
  closeClientCreateDialog,
  ClientCreateDialog,
} from './client-create-dialog';
import { ClientListTable, clientDetailActionLabel, clientDetailPath } from './client-list-table';
import { loadClientList, type ClientListLoadUpdate } from './client-load-state';
import ClientsPage from './page';

vi.mock('@/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    code = 'VALIDATION_FAILED';
  },
  createClient: vi.fn(),
  listClients: vi.fn(),
}));

describe('ClientsPage', () => {
  it('keeps the searchable registry as the primary surface with a dialog trigger', () => {
    const html = renderToStaticMarkup(<ClientsPage />);

    expect(html).toContain('고객');
    expect(html).toContain('role="search"');
    expect(html).toContain('id="client-search"');
    expect(classTokensFor(html, 'aria-label="고객 목록 검색"')).toEqual(
      expect.arrayContaining(['min-w-0', 'flex-1']),
    );
    expect(classTokensFor(html, 'id="client-search"')).toContain('min-w-0');
    expect(html).toContain('고객 등록');
    expect(html).toContain('고객 목록');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('client-create-form');
    expect(html.indexOf('고객 목록')).toBeLessThan(html.indexOf('고객 등록'));
    expect(html).not.toContain('상태별 합계');
  });

  it('renders the client creation form as a labelled modal when opened', () => {
    const html = renderToStaticMarkup(
      <ClientCreateDialog
        errorMessage={null}
        form={{
          aliasesText: '',
          clientType: 'corporation',
          confidentialityLevel: 'standard',
          name: '',
        }}
        onChange={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
        open
        returnFocusRef={{ current: null }}
        submitState="idle"
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('고객명');
    expect(html).toContain('고객 유형');
    expect(html).toContain('기밀도');
    expect(html).toContain('별칭');
    expect(html).toContain('구명칭, 약칭');
  });

  it('wraps modal focus at both ends and returns focus after Escape close', () => {
    expect(clientDialogFocusTarget(0, 4, true)).toBe(3);
    expect(clientDialogFocusTarget(3, 4, false)).toBe(0);
    expect(clientDialogFocusTarget(-1, 4, false)).toBe(0);
    expect(clientDialogFocusTarget(1, 4, false)).toBeNull();

    const onClose = vi.fn();
    const focus = vi.fn();
    const returnFocusRef = { current: { focus } };
    let scheduled: (() => void) | undefined;

    expect(
      closeClientCreateDialog(onClose, returnFocusRef, (callback) => {
        scheduled = callback;
      }),
    ).toBe(true);

    expect(onClose).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
    scheduled?.();
    expect(focus).toHaveBeenCalledOnce();

    const blockedClose = vi.fn(() => false);
    let blockedScheduleCalls = 0;
    expect(
      closeClientCreateDialog(blockedClose, returnFocusRef, () => {
        blockedScheduleCalls += 1;
      }),
    ).toBe(false);
    expect(blockedClose).toHaveBeenCalledOnce();
    expect(blockedScheduleCalls).toBe(0);
  });

  it('links customer rows to the client detail page', () => {
    const html = renderToStaticMarkup(<ClientListTable clients={[clientFixture]} />);

    expect(html).toContain('한빛전자');
    expect(html).toContain('href="/clients/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain('>11111111-1111-4111-8111-111111111111<');
    expect(html).not.toContain('href="/matters?clientId=');
  });

  it('gives duplicate and long-name client actions distinct full accessible names', () => {
    const duplicateA = {
      ...clientFixture,
      clientId: '11111111-1111-4111-8111-111111111113',
      displayName: '한빛전자 법률지원 및 장기 자문 담당 부서',
      name: '한빛전자 법률지원 및 장기 자문 담당 부서',
    };
    const duplicateB = { ...duplicateA, clientId: '11111111-1111-4111-8111-111111111114' };
    const html = renderToStaticMarkup(<ClientListTable clients={[duplicateA, duplicateB]} />);

    expect(html).toContain(
      'aria-label="고객 상세 보기: 한빛전자 법률지원 및 장기 자문 담당 부서 · 목록 1번"',
    );
    expect(html).toContain(
      'aria-label="고객 상세 보기: 한빛전자 법률지원 및 장기 자문 담당 부서 · 목록 2번"',
    );
    expect(html).toContain('href="/clients/11111111-1111-4111-8111-111111111113"');
    expect(html).toContain('href="/clients/11111111-1111-4111-8111-111111111114"');
    expect(clientDetailActionLabel(duplicateA, 0)).not.toContain(duplicateA.clientId);
  });

  it('builds the client detail route', () => {
    expect(clientDetailPath('client/ref')).toBe('/clients/client%2Fref');
  });

  it('builds a bounded createClient payload with deduplicated aliases', () => {
    expect(
      buildCreateClientInput({
        aliasesText: ' 한빛전자, HB Electronics\n한빛전자 ',
        clientType: 'corporation',
        confidentialityLevel: 'high',
        name: ' 한빛전자 ',
      }),
    ).toEqual({
      aliases: ['한빛전자', 'HB Electronics'],
      clientType: 'corporation',
      confidentialityLevel: 'high',
      name: '한빛전자',
      status: 'active',
    });
  });

  it('rejects incomplete customer form state', () => {
    expect(() =>
      buildCreateClientInput({
        aliasesText: '',
        clientType: 'corporation',
        confidentialityLevel: 'standard',
        name: '',
      }),
    ).toThrow();
  });

  it('parses alias text without keeping blanks', () => {
    expect(parseClientAliases(' AMIC,\n, 에이믹 ')).toEqual(['AMIC', '에이믹']);
  });

  it('prepends a newly created client to the unfiltered list without duplicates', () => {
    const createdClient = { ...clientFixture, clientId: '22222222-2222-4222-8222-222222222222' };

    expect(prependCreatedClient([clientFixture], createdClient)).toEqual([
      createdClient,
      clientFixture,
    ]);
    expect(prependCreatedClient([createdClient, clientFixture], createdClient)).toEqual([
      createdClient,
      clientFixture,
    ]);
  });

  it('ignores stale success and error updates after a newer list request starts', async () => {
    const updates: ClientListLoadUpdate[] = [];
    const first = deferred<ClientListDto>();
    const second = deferred<ClientListDto>();

    const cancelFirst = loadClientList(
      { pageSize: 100, q: '이전' },
      (update) => updates.push(update),
      () => first.promise,
    );
    loadClientList(
      { pageSize: 100, q: '최신' },
      (update) => updates.push(update),
      () => second.promise,
    );

    cancelFirst();
    first.resolve(clientListResult('이전 결과'));
    second.resolve(clientListResult('최신 결과'));
    await flushPromises();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ loadState: 'ready', clients: [{ name: '최신 결과' }] });

    const third = deferred<ClientListDto>();
    const fourth = deferred<ClientListDto>();
    const updatesAfterError: ClientListLoadUpdate[] = [];
    const cancelThird = loadClientList(
      { pageSize: 100, q: '오래된 오류' },
      (update) => updatesAfterError.push(update),
      () => third.promise,
    );
    loadClientList(
      { pageSize: 100, q: '최신 오류' },
      (update) => updatesAfterError.push(update),
      () => fourth.promise,
    );

    cancelThird();
    third.reject(new Error('old request failed'));
    fourth.resolve(clientListResult('최신 결과 2'));
    await flushPromises();

    expect(updatesAfterError).toHaveLength(1);
    expect(updatesAfterError[0]).toMatchObject({
      loadState: 'ready',
      clients: [{ name: '최신 결과 2' }],
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

function clientListResult(name: string): ClientListDto {
  return {
    items: [{ ...clientFixture, displayName: name, name }],
    page: 1,
    pageSize: 100,
    totalCount: 1,
  };
}

function classTokensFor(html: string, attribute: string): string[] {
  const tag = html.match(new RegExp(`<[^>]*${attribute}[^>]*>`))?.[0];
  return tag?.match(/class="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
}

const clientFixture: ClientDto = {
  aliases: ['Hanbit Electronics'],
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
