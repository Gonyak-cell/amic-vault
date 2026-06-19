import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EthicalWallDetailDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { WallPolicyInspector } from './wall-policy-inspector';

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

describe('WallPolicyInspector', () => {
  it('renders policy context without exposing internal references', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <WallPolicyInspector item={item} />
      </LanguageProvider>,
    );

    expect(html).toContain('정책 상세');
    expect(html).toContain('Conflict wall');
    expect(html).toContain('사건 정보는 권한 확인 후 표시됩니다.');
    expect(html).not.toContain('내부 참조는 기본 화면에 표시하지 않음');
    expect(html).toContain('접근 차단');
    expect(html).not.toContain(item.wall.wallId);
    expect(html).not.toContain(item.wall.matterId);
    expect(html).not.toContain(item.memberships[0]?.subjectId);
    expect(html).not.toContain('11111111');
  });

  it('renders an empty policy inspector state', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <WallPolicyInspector item={null} />
      </LanguageProvider>,
    );

    expect(html).toContain('선택한 정보 장벽이 없습니다.');
  });
});
