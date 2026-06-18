import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { WallAdminClient } from './wall-admin-client';

describe('WallAdminClient', () => {
  it('uses Matter Code picker copy for common wall work and keeps raw refs in advanced security operations', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <WallAdminClient />
      </LanguageProvider>,
    );

    expect(html).toContain('정보 장벽');
    expect(html).toContain('aria-label="정보 장벽 조회"');
    expect(html).toContain('Matter app 연결 필요');
    expect(html).toContain('정책 작업');
    expect(html).toContain('정보 장벽 추가');
    expect(html).toContain('보안 운영 참조 입력');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('정보 장벽 ID');
    expect(html).not.toContain('사용자 ID');
  });
});
