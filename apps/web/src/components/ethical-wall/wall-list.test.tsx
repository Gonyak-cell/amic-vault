import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EthicalWallDetailDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { WallList } from './wall-list';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const item: EthicalWallDetailDto = {
  wall: {
    wallId: '11111111-1111-4111-8111-1111111111aa',
    tenantId: '11111111-1111-4111-8111-111111111111',
    matterId: '11111111-1111-4111-8111-1111111111bb',
    wallName: 'Conflict wall',
    status: 'active',
    createdBy: '11111111-1111-4111-8111-111111111110',
    createdAt: '2026-06-12T00:00:00.000Z',
    releasedBy: null,
    releasedAt: null,
  },
  memberships: [
    {
      membershipId: '11111111-1111-4111-8111-1111111111cc',
      wallId: '11111111-1111-4111-8111-1111111111aa',
      tenantId: '11111111-1111-4111-8111-111111111111',
      subjectType: 'user',
      subjectId: '11111111-1111-4111-8111-111111111102',
      membershipType: 'excluded',
      createdBy: '11111111-1111-4111-8111-111111111110',
      createdAt: '2026-06-12T00:00:01.000Z',
    },
  ],
};

describe('WallList', () => {
  it('renders wall memberships without raw wall or user references', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <WallList items={[item]} />
      </LanguageProvider>,
    );

    expect(html).toContain('Conflict wall');
    expect(html).toContain('접근 차단');
    expect(html).toContain('사용자');
    expect(html).not.toContain(item.wall.wallId);
    expect(html).not.toContain(item.wall.matterId);
    expect(html).not.toContain(item.memberships[0]?.subjectId);
    expect(html).not.toContain('11111111');
    expect(html).not.toContain('excluded');
    expect(html).not.toContain('conflict_check');
  });
});
