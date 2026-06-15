import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VaultActivityClient } from './vault-activity-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

describe('VaultActivityClient', () => {
  it('renders the release dashboard with empty states instead of seeded demo records', () => {
    const html = renderToStaticMarkup(<VaultActivityClient />);

    expect(html).toContain('사건 대시보드');
    expect(html).toContain('최근 활동');
    expect(html).toContain('실제 사건 데이터가 없습니다.');
    expect(html).toContain('요약 수치가 없습니다.');
    expect(html).toContain('표시할 사건 속성이 없습니다.');
    expect(html).not.toContain('Cobalt Energy Holdings');
    expect(html).not.toContain('M-2026-0147');
    expect(html).not.toContain('09:42');
    expect(html).not.toContain('18:42');
    expect(html).not.toContain('주식매매계약서');
    expect(html).not.toContain('NDA 동의 대기 중');
    expect(html).not.toContain('외부 검토자');
    expect(html).not.toContain('1,284');
    expect(html).not.toContain('100%');
    expect(html).not.toContain('DOCUMENT_VIEWED');
    expect(html).not.toContain('AI_POLICY_BLOCKED');
    expect(html).not.toContain('body_logged');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
