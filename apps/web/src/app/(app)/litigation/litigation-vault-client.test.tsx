import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
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
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LitigationVaultClient />
      </LanguageProvider>,
    );
    expect(html).toContain('소송 자료');
    expect(html).toContain('증거 저장');
    expect(html).not.toContain('Litigation Vault');
    expect(html).not.toMatch(/external|share|secure link|portal|vdr|e-filing|efile/iu);
  });
});
