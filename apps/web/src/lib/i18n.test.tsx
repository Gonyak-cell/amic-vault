import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  documentExtractionMethodLabels,
  documentPrivilegeLabels,
  documentStatusLabels,
  getTranslation,
  LanguageProvider,
  LanguageToggle,
  matterLeadRoleLabels,
  userRoleLabels,
} from './i18n';

describe('i18n shell helpers', () => {
  it('resolves translations only through explicit keys', () => {
    expect(getTranslation('nav.globalSearch', 'ko')).toBe('Matter, 문서, 활동 검색');
    expect(getTranslation('nav.globalSearch', 'en')).toBe('Search matters, files, and activity');
    expect(getTranslation('nav.group.governance', 'ko')).toBe('정책 관리');
    expect(getTranslation('route.blocked.cardMeta', 'ko')).toBe('사용 제한');
    expect(getTranslation('search.facet.ocrLowConfidence', 'ko')).toBe('OCR 신뢰도 낮음');
    expect(getTranslation('search.facet.workProduct', 'ko')).toBe('변호사 업무상 작성자료');
    expect(getTranslation('dataState.loading', 'ko')).toBe('불러오는 중입니다.');
    expect(getTranslation('dataState.error', 'en')).toBe('The requested data cannot be displayed.');
    expect(getTranslation('dataState.unavailable', 'ko')).toContain('데이터 연결');
    expect(getTranslation('dataState.forbidden', 'ko')).toBe('이 항목을 볼 권한이 없습니다.');
    expect(getTranslation('dataState.blocked', 'en')).toBe(
      'An information barrier policy prevents display.',
    );
  });

  it('keeps wire enum labels behind natural Korean display mappings', () => {
    expect(userRoleLabels.ko.firm_admin).toBe('운영 관리자');
    expect(documentStatusLabels.ko.internal_review).toBe('내부 검토');
    expect(documentPrivilegeLabels.ko.privileged).toBe('변호사-의뢰인 특권');
    expect(documentExtractionMethodLabels.ko.pdf_text).toBe('PDF 본문');
    expect(documentExtractionMethodLabels.ko.pdf_text).not.toBe('pdf_text');
    expect(matterLeadRoleLabels.ko.lead_associate).toBe('담당 변호사');
  });

  it('renders the language toggle with Korean as the server-safe default', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LanguageToggle />
      </LanguageProvider>,
    );

    expect(html).toContain('aria-label="언어"');
    expect(html).toContain('<select');
    expect(html).toContain('한국어');
    expect(html).toContain('영어');
  });
});
