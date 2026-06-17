import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterMemberDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { AddMemberDialog } from './add-member-dialog';
import { TeamMemberList } from './team-member-list';

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const member: MatterMemberDto = {
  matterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111102',
  userDisplayName: '조우상',
  userDisplayEmail: 'jwsuh@amic.kr',
  matterRole: 'member',
  accessLevel: 'read',
  addedBy: '11111111-1111-4111-8111-111111111101',
  addedAt: '2026-06-12T00:00:00.000Z',
};

describe('TeamMemberList', () => {
  it('renders members without management controls for read-only viewers', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TeamMemberList members={[member]} canManage={false} />
      </LanguageProvider>,
    );
    expect(html).toContain('조우상');
    expect(html).toContain('jwsuh@amic.kr');
    expect(html).not.toContain('표시 가능한 사용자 정보 없음');
    expect(html).not.toContain('내부 참조는 표시하지 않음');
    expect(html).toContain('팀 구성원 표');
    expect(html).toContain('min-w-[720px]');
    expect(html).not.toContain(member.userId);
    expect(html).toContain('팀원');
    expect(html).toContain('보기');
    expect(html).not.toContain('Save team member');
    expect(html).not.toContain('Remove team member');
  });

  it('renders safe denied copy without target leakage', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TeamMemberList members={[member]} canManage errorCode="PERMISSION_DENIED" />
      </LanguageProvider>,
    );
    expect(html).toContain('이 작업을 할 권한이 없습니다.');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});

describe('AddMemberDialog', () => {
  it('renders role and access controls', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AddMemberDialog />
      </LanguageProvider>,
    );
    expect(html).toContain('역할');
    expect(html).toContain('접근 권한');
    expect(html).toContain('구성원 추가');
    expect(html).toContain('고급 사용자 참조 입력');
    expect(html).not.toContain('사용자 ID');
  });
});
