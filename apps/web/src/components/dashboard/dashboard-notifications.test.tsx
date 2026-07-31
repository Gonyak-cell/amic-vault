import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDashboardUnavailableState } from '@/lib/api/dashboard';
import { DashboardNotificationsSection } from './dashboard-notifications';

describe('DashboardNotificationsSection', () => {
  it('keeps policy blocking separate from permission copy', () => {
    const html = renderToStaticMarkup(
      <DashboardNotificationsSection
        itemsState={{ status: 'blocked', error: 'policy' }}
        state={createDashboardUnavailableState()}
      />,
    );

    expect(html).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
    expect(html).not.toContain('정보 차단 또는 권한 정책');
    expect(html).not.toContain('알림 데이터에 접근할 권한이 없습니다.');
  });
});
