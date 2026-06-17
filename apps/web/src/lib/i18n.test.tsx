import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getTranslation, LanguageProvider, LanguageToggle } from './i18n';

describe('i18n shell helpers', () => {
  it('resolves translations only through explicit keys', () => {
    expect(getTranslation('nav.globalSearch', 'ko')).toBe('사건, 파일, 활동 검색');
    expect(getTranslation('nav.globalSearch', 'en')).toBe('Search matters, files, and activity');
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
