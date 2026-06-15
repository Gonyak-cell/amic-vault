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
  it('renders a matter activity console with reference-only security evidence', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <VaultActivityClient />
      </LanguageProvider>,
    );

    expect(html).toContain('계약 자료실');
    expect(html).toContain('활동 기록');
    expect(html).toContain('파일 열람');
    expect(html).toContain('외부 AI 사용 제한');
    expect(html).toContain('본문 기록');
    expect(html).not.toContain('Cobalt M&amp;A Data Room');
    expect(html).not.toContain('DOCUMENT_VIEWED');
    expect(html).not.toContain('AI_POLICY_BLOCKED');
    expect(html).not.toContain('body_logged');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
