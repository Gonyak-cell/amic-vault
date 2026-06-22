import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountLedgerAdminClient } from './account-ledger-admin-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/lib/api/account-ledger', () => ({
  assignAccountLedgerId: vi.fn(),
}));

describe('AccountLedgerAdminClient', () => {
  it('renders the account ledger assignment panel without exposing raw user references', () => {
    const html = renderToStaticMarkup(<AccountLedgerAdminClient />);

    expect(html).toContain('계정 원장 ID');
    expect(html).toContain('전역 유일 로그인 ID');
    expect(html).toContain('사용자 또는 그룹 검색');
    expect(html).toContain('원장 ID');
    expect(html).toContain('배정');
    expect(html).toContain('사용자 미선택');
    expect(html).not.toContain('user_id');
    expect(html).not.toContain('target_user_id');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});
