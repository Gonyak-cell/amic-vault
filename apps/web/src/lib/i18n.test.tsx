import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getTranslation, LanguageProvider, LanguageToggle } from './i18n';

describe('i18n shell helpers', () => {
  it('resolves translations only through explicit keys', () => {
    expect(getTranslation('nav.globalSearch', 'ko')).toBe('Matter, 문서, 활동 검색');
    expect(getTranslation('nav.globalSearch', 'en')).toBe('Search matters, files, and activity');
    expect(getTranslation('nav.group.governance', 'ko')).toBe('정책 관리');
    expect(getTranslation('route.blocked.cardMeta', 'ko')).toBe('사용 제한');
    expect(getTranslation('search.facet.ocrLowConfidence', 'ko')).toBe('OCR 신뢰도 낮음');
    expect(getTranslation('search.facet.workProduct', 'ko')).toBe('변호사 업무상 작성자료');
    expect(getTranslation('dataState.loading', 'ko')).toBe('불러오는 중입니다.');
    expect(getTranslation('dataState.error', 'en')).toBe('Unable to display data.');
    expect(getTranslation('dataState.forbidden', 'ko')).toBe('이 항목을 볼 권한이 없습니다.');
    expect(getTranslation('dataState.blocked', 'en')).toBe(
      'Information barrier or permission policy prevents display.',
    );
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
