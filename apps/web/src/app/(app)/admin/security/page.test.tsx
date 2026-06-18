import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import AdminSecurityPage from './page';

describe('AdminSecurityPage', () => {
  it('keeps security settings hidden until admin route visibility is confirmed', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AdminSecurityPage />
      </LanguageProvider>,
    );

    expect(html).toContain('접근 상태 확인 중');
    expect(html).toContain('보안 설정');
    expect(html).not.toContain('Corporate IdP');
    expect(html).not.toContain('sampleHash');
  });
});
