import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { DdVaultClient } from './dd-vault-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/lib/api/dd', () => ({
  createDdIssue: vi.fn(),
  createDdMapping: vi.fn(),
  createDdRfi: vi.fn(),
  createDdRisk: vi.fn(),
  listDdIssues: vi.fn(),
  listDdMappings: vi.fn(),
  listDdRfis: vi.fn(),
  listDdRisks: vi.fn(),
  loadDdTraceability: vi.fn(),
}));

vi.mock('@/lib/api/error-messages', () => ({
  safeApiErrorMessage: () => 'VALIDATION_FAILED',
}));

describe('DdVaultClient', () => {
  it('renders the internal DD workbench without external-sharing affordances', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <DdVaultClient />
      </LanguageProvider>,
    );

    expect(html).toContain('실사 자료');
    expect(html).toContain('자료 매핑');
    expect(html).toContain('연결');
    expect(html).not.toContain('Data Room Mapping');
    expect(html).not.toContain('Secure Link');
    expect(html).not.toContain('External Portal');
    expect(html).not.toContain('VDR');
  });
});
