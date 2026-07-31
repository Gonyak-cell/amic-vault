import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClientDto, MatterDto } from '@amic-vault/shared';
import { ClientDetailView, clientMatterFilterPath } from './client-detail-view';

vi.mock('@/lib/api-client', () => ({
  getClient: vi.fn(),
  listMatters: vi.fn(),
}));

describe('ClientDetailPage', () => {
  it('renders client master fields and client-scoped matters', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterPage={1}
        matterTotalCount={1}
        matters={[matterFixture]}
      />,
    );

    expect(html).toContain('한빛전자');
    expect(html).toContain('고객 정보');
    expect(html).toContain('구명칭·별칭');
    expect(html).toContain('Hanbit Electronics');
    expect(html).toContain('고객 Matter');
    expect(html).toContain('총 1건');
    expect(html).toContain('계약 검토');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('href="/matters?clientId=11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111122"');
    expect(html).not.toMatch(/>11111111-1111-4111-8111-111111111111</u);
    expect(html).not.toContain('이 고객의 Matter와 관련 문서를 확인합니다.');
    expect(html).not.toContain('고객 포털');
    expect(html).not.toContain('CRM');
  });

  it('renders a bounded empty matter state for clients without matters', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterPage={1}
        matterTotalCount={0}
        matters={[]}
      />,
    );

    expect(html).toContain('이 고객의 Matter가 없습니다.');
    expect(html).toContain('총 0건');
  });

  it('does not discard server items when a response carries an exact zero total', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterLoadState="ready"
        matterPage={1}
        matterTotalCount={0}
        matters={[matterFixture]}
      />,
    );

    expect(html).toContain('계약 검토');
    expect(html).not.toContain('이 고객의 Matter가 없습니다.');
  });

  it('keeps a Matter with no client display name explicit instead of inventing one', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterLoadState="ready"
        matterPage={1}
        matterTotalCount={1}
        matters={[{ ...matterFixture, clientDisplayName: null }]}
      />,
    );

    expect(html).toContain('고객 표시명 없음');
    expect(html).not.toContain('고객 정보 없음');
  });

  it('renders mixed-status Matter portfolios without reducing them to one aggregate', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterLoadState="ready"
        matterPage={1}
        matterTotalCount={2}
        matters={[
          matterFixture,
          { ...matterFixture, matterId: '11111111-1111-4111-8111-111111111123', status: 'closed' },
        ]}
      />,
    );

    expect(html).toContain('접수');
    expect(html).toContain('종결');
    expect(html).not.toContain('상태별 합계');
  });

  it('labels a paginated portfolio without presenting the visible page as the total', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterPage={1}
        matterTotalCount={101}
        matters={[matterFixture]}
      />,
    );

    expect(html).toContain('전체 101건');
    expect(html).toContain('현재 페이지 1건 표시');
    expect(html).toContain('전체 101건 중 현재 페이지 1건만 표시합니다.');
    expect(html).not.toContain('상태별 합계');
  });

  it('keeps client details visible when the Matter portfolio fails', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterLoadState="error"
        matters={[]}
      />,
    );

    expect(html).toContain('고객 정보');
    expect(html).toContain('한빛전자');
    expect(html).toContain('Matter 목록을 표시하지 못했습니다.');
    expect(html).toContain('잠시 후 다시 시도해 주세요.');
    expect(html).not.toContain('이 고객의 Matter가 없습니다.');
  });

  it('keeps a successful Matter portfolio visible when the client request fails', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        clientId={clientFixture.clientId}
        client={null}
        loadState="error"
        matterLoadState="ready"
        matterPage={1}
        matterTotalCount={1}
        matters={[matterFixture]}
      />,
    );

    expect(html).toContain('요청한 데이터를 표시할 수 없습니다.');
    expect(html).toContain('고객 Matter');
    expect(html).toContain('계약 검토');
    expect(html).toContain('href="/matters?clientId=11111111-1111-4111-8111-111111111111"');
  });

  it.each([
    ['loading', 'Matter를 불러오는 중입니다.'],
    ['forbidden', 'Matter를 볼 권한이 없습니다.'],
    ['blocked', 'Matter가 정책에 따라 표시되지 않습니다.'],
  ] as const)('keeps the Matter portfolio %s state inside its section', (matterLoadState, copy) => {
    const html = renderToStaticMarkup(
      <ClientDetailView
        client={clientFixture}
        loadState="ready"
        matterLoadState={matterLoadState}
        matters={[]}
      />,
    );

    expect(html).toContain('고객 정보');
    expect(html).toContain('고객 Matter');
    expect(html).toContain(copy);
  });

  it.each([
    ['loading', '불러오는 중입니다.'],
    ['unavailable', '데이터 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'],
    ['error', '요청한 데이터를 표시할 수 없습니다.'],
    ['forbidden', '이 항목을 볼 권한이 없습니다.'],
    ['blocked', '정보 차단 정책에 따라 표시할 수 없습니다.'],
  ] as const)('keeps the %s state distinct without leaking the client id', (loadState, copy) => {
    const html = renderToStaticMarkup(
      <ClientDetailView client={null} loadState={loadState} matters={[]} />,
    );

    expect(html).toContain(copy);
    expect(html).not.toContain(clientFixture.clientId);
  });

  it('builds the client-scoped matter filter route', () => {
    expect(clientMatterFilterPath('client/ref')).toBe('/matters?clientId=client%2Fref');
  });

  it('renders natural fallback labels when the wire sends unknown client enums', () => {
    const unknownClient = { ...clientFixture };
    Reflect.set(unknownClient, 'clientType', 'legacy_partner');
    Reflect.set(unknownClient, 'status', 'pending');
    Reflect.set(unknownClient, 'confidentialityLevel', 'secret');

    const html = renderToStaticMarkup(
      <ClientDetailView
        client={unknownClient}
        loadState="ready"
        matterPage={1}
        matterTotalCount={0}
        matters={[]}
      />,
    );

    expect(html).toContain('확인되지 않은 고객 유형');
    expect(html).toContain('확인되지 않은 고객 상태');
    expect(html).toContain('확인되지 않은 기밀도');
    expect(html).not.toContain('legacy_partner');
    expect(html).not.toContain('pending');
    expect(html).not.toContain('secret');
  });
});

const clientFixture: ClientDto = {
  aliases: ['Hanbit Electronics', 'HB Electronics'],
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

const matterFixture: MatterDto = {
  clientDisplayName: '한빛전자',
  clientId: clientFixture.clientId,
  closedAt: null,
  confidentialityLevel: 'standard',
  conflictsStatus: 'cleared',
  createdAt: '2026-07-02T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111112',
  displayName: '계약 검토',
  ethicalWallActive: false,
  leadAssociateId: null,
  leadLawyerId: null,
  leadPartnerId: null,
  legalHold: false,
  matterCode: 'AMIC-2026-0007',
  matterId: '11111111-1111-4111-8111-111111111122',
  matterName: '계약 검토',
  matterType: 'advisory',
  metadata: {},
  openedAt: '2026-07-02T00:00:00.000Z',
  practiceGroup: 'AMIC_LAW_GROUP',
  safeLabel: '계약 검토',
  status: 'open',
  tenantId: '11111111-1111-4111-8111-111111111100',
  updatedAt: '2026-07-02T00:00:00.000Z',
};
