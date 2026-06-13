import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders the Amplitude-inspired navigation shell with explicit i18n text', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AppShell>
          <section>Dashboard payload</section>
        </AppShell>
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('aria-label="Navigation 열기"');
    expect(html).toContain('Matter, document, event 검색');
    expect(html).toContain('Dashboard payload');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/launch"');
    expect(html).toContain('href="/records"');
  });
});
