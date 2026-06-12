import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
    const html = renderToStaticMarkup(<ContractIntelClient />);

    expect(html).toContain('Contracts');
    expect(html).toContain('Clause Bank');
    expect(html).toContain('Rule Findings');
    expect(html).not.toContain('Confidential Information means');
    expect(html).not.toContain('raw clause body');
  });
});
