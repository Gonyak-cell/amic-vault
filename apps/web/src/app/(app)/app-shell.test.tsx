import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders the Vault workspace shell with business navigation labels', () => {
    const html = renderToStaticMarkup(
        <LanguageProvider>
          <AppShell>
          <section>대시보드 내용</section>
        </AppShell>
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('aria-label="Vault 검색"');
    expect(html).toContain('사건, 파일, 담당자 검색');
    expect(html).toContain('Vault 워크스페이스');
    expect(html).toContain('실제 워크스페이스 연결 후 표시됩니다.');
    expect(html).toContain('접근 기록');
    expect(html).toContain('운영 상태');
    expect(html).toContain('대시보드 내용');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/launch"');
    expect(html).toContain('href="/records"');
    expect(html).not.toContain('Gonyak Legal Ops');
    expect(html).not.toContain('amic-prod-shadow');
    expect(html).not.toContain('18:42');
    expect(html).not.toContain('감사 로그');
    expect(html).not.toContain('출시 관리');
  });
});
