import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { ExternalPortalClient } from './external-portal-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <section {...props}>{children}</section>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <header {...props}>{children}</header>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
}));

vi.mock('@/lib/api/external-portal', () => ({
  acceptExternalNda: vi.fn(),
  createExternalQuestion: vi.fn(),
  getExternalAccessStatus: vi.fn(),
  getExternalDownloadTicket: vi.fn(),
  getExternalManifest: vi.fn(),
  listExternalQa: vi.fn(),
}));

describe('ExternalPortalClient', () => {
  it('renders outside the internal app shell', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ExternalPortalClient token="opaque-token" />
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault 외부 공유');
    expect(html).toContain('공유 문서');
    expect(html).not.toContain('External Portal');
    expect(html).not.toContain('Matter document control');
    expect(html).not.toContain('Dashboard');
    expect(html).not.toContain('Logout');
    expect(html).not.toContain('opaque-token');
    expect(html).not.toContain('다운로드 ID');
    expect(html).not.toContain('Download ref');
  });
});
