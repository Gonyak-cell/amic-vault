import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { VaultActivityClient } from './vault-activity-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

describe('VaultActivityClient', () => {
  it('renders a matter activity console without seeded demo records', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <VaultActivityClient />
      </LanguageProvider>,
    );

    expect(html).toContain('Matter 대시보드');
    expect(html).toContain('활동 기록');
    expect(html).toContain('실제 Matter 데이터가 없습니다.');
    expect(html).toContain('요약 수치가 없습니다.');
    expect(html).not.toContain('Cobalt Energy Holdings');
    expect(html).not.toContain('M-2026-0147');
    expect(html).not.toContain('09:42');
    expect(html).not.toContain('파일 열람');
    expect(html).not.toContain('외부 AI 사용 제한');
    expect(html).not.toContain('주식매매계약서');
    expect(html).not.toContain('1,284');
    expect(html).not.toContain('100%');
    expect(html).not.toContain('DOCUMENT_VIEWED');
    expect(html).not.toContain('AI_POLICY_BLOCKED');
    expect(html).not.toContain('body_logged');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
