import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import IntegrationsPage from '../page';
import OutlookIntegrationPage from './page';

describe('integration status routes', () => {
  it('renders only empty operational states before integration APIs are connected', () => {
    const html = [
      renderToStaticMarkup(<IntegrationsPage />),
      renderToStaticMarkup(<OutlookIntegrationPage />),
    ].join('\n');

    expect(html).toContain('통합');
    expect(html).toContain('연결된 통합이 없습니다.');
    expect(html).toContain('Outlook 연결 상태를 표시할 수 없습니다.');
    expect(html).toContain('이 영역은 아직 운영 데이터와 연결되지 않았습니다.');
    expect(html).not.toContain('OneDrive 연결됨');
    expect(html).not.toContain('Microsoft 365 연결됨');
    expect(html).not.toMatch(/>0</);
  });
});
