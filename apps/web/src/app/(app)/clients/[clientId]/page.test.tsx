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
      <ClientDetailView client={clientFixture} loadState="ready" matters={[matterFixture]} />,
    );

    expect(html).toContain('한빛전자');
    expect(html).toContain('고객 정보');
    expect(html).toContain('구명칭·별칭');
    expect(html).toContain('Hanbit Electronics');
    expect(html).toContain('고객 Matter');
    expect(html).toContain('계약 검토');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('href="/matters?clientId=11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain('고객 포털');
    expect(html).not.toContain('CRM');
  });

  it('renders a bounded empty matter state for clients without matters', () => {
    const html = renderToStaticMarkup(
      <ClientDetailView client={clientFixture} loadState="ready" matters={[]} />,
    );

    expect(html).toContain('이 고객의 Matter가 없습니다.');
  });

  it('builds the client-scoped matter filter route', () => {
    expect(clientMatterFilterPath('client/ref')).toBe('/matters?clientId=client%2Fref');
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
