import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { WallAdminClient } from './wall-admin-client';

describe('WallAdminClient', () => {
  it('uses Matter Code and org subject pickers without raw reference entry copy', () => {
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
    expect(html).toContain('정보 장벽 구성원 추가');
    expect(html).toContain('조직 디렉터리');
    expect(html).toContain('사용자 또는 그룹 검색');
    expect(html).toContain('차단 예외');
    expect(html).toContain('접근 차단');
    expect(html).not.toContain('보안 운영 참조 입력');
    expect(html).not.toContain('사용자 참조');
    expect(html).not.toContain('정보 장벽 참조');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('정보 장벽 ID');
    expect(html).not.toContain('사용자 ID');
  });
});
