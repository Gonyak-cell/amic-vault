import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientDto } from '@amic-vault/shared';
import { ClientListTable, clientDetailPath } from './client-list-table';

describe('ClientListTable responsive density', () => {
  it('keeps client name and status visible without a fixed narrow-screen width', () => {
    const client = clientFixture();
    const html = renderToStaticMarkup(<ClientListTable clients={[client]} />);

    expect(html).not.toContain('min-w-[860px]');
    expect(html).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(html).toContain('md:grid-cols-[minmax(0,1fr)_minmax(100px,0.4fr)_auto]');
    expect(html).toContain('xl:grid-cols-[minmax(220px,1fr)_120px_110px_110px_minmax(180px,1fr)]');
    expect(html).toContain('한빛전자');
    expect(html).toContain('활성');
    expect(html).toContain('href="/clients/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toMatch(/>11111111-1111-4111-8111-111111111111</);
  });

  it('keeps lower-priority type, confidentiality, and aliases in the DOM for wider breakpoints', () => {
    const html = renderToStaticMarkup(<ClientListTable clients={[clientFixture()]} />);

    expect(html).toContain('hidden truncate text-muted-foreground md:block');
    expect(html).toContain('hidden truncate text-muted-foreground xl:block');
    expect(html).toContain('법인');
    expect(html).toContain('표준');
    expect(html).toContain('Hanbit Electronics');
  });

  it('preserves encoded detail links for client identifiers', () => {
    expect(clientDetailPath('client/ref')).toBe('/clients/client%2Fref');
  });
});

function clientFixture(): ClientDto {
  return {
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
}
