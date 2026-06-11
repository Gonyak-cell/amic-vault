import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterMemberDto } from '@amic-vault/shared';
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
  matterRole: 'member',
  accessLevel: 'read',
  addedBy: '11111111-1111-4111-8111-111111111101',
  addedAt: '2026-06-12T00:00:00.000Z',
};

describe('TeamMemberList', () => {
  it('renders members without management controls for read-only viewers', () => {
    const html = renderToStaticMarkup(<TeamMemberList members={[member]} canManage={false} />);
    expect(html).toContain(member.userId);
    expect(html).toContain('member');
    expect(html).not.toContain('Save team member');
    expect(html).not.toContain('Remove team member');
  });

  it('renders safe denied copy without target leakage', () => {
    const html = renderToStaticMarkup(
      <TeamMemberList members={[member]} canManage errorCode="PERMISSION_DENIED" />,
    );
    expect(html).toContain('Request denied');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});

describe('AddMemberDialog', () => {
  it('renders role and access controls', () => {
    const html = renderToStaticMarkup(<AddMemberDialog />);
    expect(html).toContain('Matter role');
    expect(html).toContain('Access level');
    expect(html).toContain('Add team member');
  });
});
