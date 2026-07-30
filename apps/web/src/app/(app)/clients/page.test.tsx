import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClientDto } from '@amic-vault/shared';
import { buildCreateClientInput, parseClientAliases } from './client-create-contract';
import { ClientListTable, clientDetailPath } from './client-list-table';
import ClientsPage from './page';

vi.mock('@/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    code = 'VALIDATION_FAILED';
  },
  createClient: vi.fn(),
  listClients: vi.fn(),
}));

describe('ClientsPage', () => {
  it('renders the searchable registry before the collapsed creation disclosure', () => {
    const html = renderToStaticMarkup(<ClientsPage />);

    expect(html).toContain('고객');
    expect(html).toContain('role="search"');
    expect(html).toContain('id="client-search"');
    expect(html).toContain('고객 등록');
    expect(html).toContain('고객 목록');
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('aria-controls="client-create-form"');
    expect(html.indexOf('고객 목록')).toBeLessThan(html.indexOf('고객 등록'));
    expect(html).toContain('고객명');
    expect(html).toContain('고객 유형');
    expect(html).toContain('기밀도');
    expect(html).toContain('별칭');
    expect(html).toContain('구명칭, 약칭');
    expect(html).not.toContain('CRM');
    expect(html).not.toContain('고객 포털');
  });

  it('links customer rows to the client detail page', () => {
    const html = renderToStaticMarkup(<ClientListTable clients={[clientFixture]} />);

    expect(html).toContain('한빛전자');
    expect(html).toContain('href="/clients/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain('>11111111-1111-4111-8111-111111111111<');
    expect(html).not.toContain('href="/matters?clientId=');
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
});

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
