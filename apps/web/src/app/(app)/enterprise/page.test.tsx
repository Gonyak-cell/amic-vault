import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import EnterprisePage from './page';

describe('EnterprisePage', () => {
  it('does not render admin settings before route role visibility is confirmed', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <EnterprisePage />
      </LanguageProvider>,
    );

    expect(html).toContain('접근 상태 확인 중');
    expect(html).toContain('관리자 화면은 계정 권한이 확인되기 전까지 표시하지 않습니다.');
    expect(html).not.toContain('SSO');
    expect(html).not.toContain('고객 관리 키');
    expect(html).not.toContain('SIEM');
  });
});
