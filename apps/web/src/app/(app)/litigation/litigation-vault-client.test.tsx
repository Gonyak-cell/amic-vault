import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LitigationVaultClient } from './litigation-vault-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/lib/api/litigation', () => ({
  createLitigationEvidence: vi.fn(),
  createLitigationFact: vi.fn(),
  createLitigationIssue: vi.fn(),
  createLitigationPleading: vi.fn(),
  listLitigationEvidence: vi.fn(),
  listLitigationFacts: vi.fn(),
  listLitigationIssues: vi.fn(),
  listLitigationPleadings: vi.fn(),
  loadLitigationCaseMap: vi.fn(),
}));

vi.mock('@/lib/api/error-messages', () => ({
  safeApiErrorMessage: () => 'VALIDATION_FAILED',
}));

describe('LitigationVaultClient', () => {
  it('renders internal litigation workbench without external sharing language', () => {
    const html = renderToStaticMarkup(<LitigationVaultClient />);
    expect(html).toContain('Litigation Vault');
    expect(html).toContain('Save Evidence');
    expect(html).not.toMatch(/external|share|secure link|portal|vdr|e-filing|efile/iu);
  });
});
