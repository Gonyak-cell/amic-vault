import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId, UserSummary } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('AppShell', () => {
  it('renders the Vault workspace shell with business navigation labels', () => {
    const currentUser: UserSummary = {
      userId: '11111111-1111-4111-8111-111111111101',
      tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
      email: 'jwsuh@amic.kr',
      name: '조우상',
      role: 'firm_admin',
      practiceGroup: null,
      status: 'active',
      mfaEnabled: false,
      lastLoginAt: null,
    };
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AppShell currentUser={currentUser}>
          <section>Dashboard payload</section>
        </AppShell>
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('aria-label="Vault 검색"');
    expect(html).toContain('사건, 파일, 담당자 검색');
    expect(html).toContain('조우상');
    expect(html).toContain('jwsuh@amic.kr');
    expect(html).toContain('접근 기록');
    expect(html).toContain('정보 차단');
    expect(html).toContain('href="/integrations/outlook"');
    expect(html).toContain('Dashboard payload');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/launch"');
    expect(html).toContain('href="/records"');
    expect(html).not.toContain('Gonyak Legal Ops');
    expect(html).not.toContain('amic-prod-shadow');
    expect(html).not.toContain('워크스페이스 ID');
    expect(html).not.toContain('>18</span>');
    expect(html).not.toContain('>642</span>');
    expect(html).not.toContain('>9</span>');
    expect(html).not.toContain('미리보기 모드');
    expect(html).not.toContain('최근 활동 18:42 KST');
    expect(html).not.toContain('감사 로그');
    expect(html).not.toContain('출시 관리');
    expect(html).not.toContain('공유 요청');
  });
});
