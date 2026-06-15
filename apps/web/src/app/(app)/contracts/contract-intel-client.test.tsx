import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { ContractIntelClient } from './contract-intel-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/lib/api/contract-intel', () => ({
  createContractPlaybookRule: vi.fn(),
  listContractClauseBank: vi.fn(),
  listContractRuleFindings: vi.fn(),
  processContractDocument: vi.fn(),
}));

vi.mock('@/lib/api/error-messages', () => ({
  safeApiErrorMessage: () => 'VALIDATION_FAILED',
}));

describe('ContractIntelClient', () => {
  it('renders the contract intelligence work surface without document body placeholders', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ContractIntelClient />
      </LanguageProvider>,
    );

    expect(html).toContain('계약 검토');
    expect(html).toContain('조항 목록');
    expect(html).toContain('규칙 검토 결과');
    expect(html).not.toContain('Expression JSON');
    expect(html).not.toContain('Confidential Information means');
    expect(html).not.toContain('raw clause body');
  });
});
