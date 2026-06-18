import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { EnterpriseHardeningClient } from './enterprise-hardening-client';

describe('EnterpriseHardeningClient', () => {
  it('renders admin settings sections without sample defaults or raw reference inputs', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <EnterpriseHardeningClient />
      </LanguageProvider>,
    );

    expect(html).toContain('관리자 설정');
    expect(html).toContain('SSO');
    expect(html).toContain('MFA');
    expect(html).toContain('고객 관리 키');
    expect(html).toContain('SIEM');
    expect(html).toContain('백업');
    expect(html).toContain('컴플라이언스');
    expect(html).toContain('DMS 구성');
    expect(html).toContain('문서 taxonomy');
    expect(html).toContain('Matter 템플릿');
    expect(html).toContain('검색 refiner');
    expect(html).toContain('저장 API 승인 전 읽기 전용');
    expect(html).toContain('운영 데이터가 아직 연결되지 않았습니다.');
    expect(html).not.toContain('SSO 제공자 ID');
    expect(html).not.toContain('제공자 ID');
    expect(html).not.toContain('키 ID');
    expect(html).not.toContain('관리 항목');
    expect(html).not.toContain('확인 자료 ID');
    expect(html).not.toContain('Corporate IdP');
    expect(html).not.toContain('corp-idp');
    expect(html).not.toContain('soc2-access-control');
    expect(html).not.toContain('sampleHash');
    expect(html).not.toContain('sampleFingerprint');
    expect(html).not.toContain('0 건');
  });
});
