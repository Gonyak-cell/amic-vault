import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import AuditPage from '../audit/page';
import IntegrationsPage from '../integrations/page';
import MatterAppIntegrationPage from '../integrations/matter-app/page';
import OutlookIntegrationPage from '../integrations/outlook/page';
import RecordsPage from '../records/page';
import WallsPage from '../walls/page';
import { AdminRouteHub } from './admin-route-hub';
import AdminPage from './page';

describe('AdminPage', () => {
  it('links to each guarded administration surface', () => {
    const html = renderToStaticMarkup(<AdminRouteHub />);

    expect(html).toContain('href="/records"');
    expect(html).toContain('href="/audit"');
    expect(html).toContain('href="/admin/security"');
    expect(html).toContain('href="/integrations/outlook"');
    expect(html).toContain('href="/integrations/matter-app"');
    expect(html).toContain('href="/enterprise"');
    expect(html).not.toContain('href="/walls"');
    expect(html).toContain('조직 설정');
  });

  it('does not render admin settings before route role visibility is confirmed', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AdminPage />
      </LanguageProvider>,
    );

    expect(html).toContain('접근 상태 확인 중');
    expect(html).toContain('관리자 화면은 계정 권한이 확인되기 전까지 표시하지 않습니다.');
    expect(html).not.toContain('SSO');
    expect(html).not.toContain('고객 관리 키');
    expect(html).not.toContain('SIEM');
    expect(html).not.toContain('href="/records"');
  });

  it('wraps every administration deep link in a fail-closed loading boundary', () => {
    const guardedRoutes = [
      { page: <RecordsPage />, hidden: '보존 정책 관리' },
      { page: <AuditPage />, hidden: '활동 기록 필터' },
      { page: <WallsPage />, hidden: '정보 차단 규칙 추가' },
      { page: <IntegrationsPage />, hidden: 'Matter 관리 시스템' },
      { page: <OutlookIntegrationPage />, hidden: '문서 보관 경로' },
      { page: <MatterAppIntegrationPage />, hidden: 'Matter 코드 기준 정보' },
    ];

    for (const route of guardedRoutes) {
      const html = renderToStaticMarkup(<LanguageProvider>{route.page}</LanguageProvider>);

      expect(html).toContain('접근 상태 확인 중');
      expect(html).not.toContain(route.hidden);
    }
  });
});
