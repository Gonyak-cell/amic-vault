import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getTranslation, LanguageProvider, LanguageToggle } from './i18n';

describe('i18n shell helpers', () => {
  it('resolves translations only through explicit keys', () => {
    expect(getTranslation('nav.globalSearch', 'ko')).toBe('사건, 파일, 활동 검색');
    expect(getTranslation('nav.globalSearch', 'en')).toBe('사건, 파일, 활동 검색');
  });

  it('renders Korean as the only customer-facing language option', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LanguageToggle />
      </LanguageProvider>,
    );

    expect(html).toContain('aria-label="언어"');
    expect(html).toContain('한국어');
    expect(html).not.toContain('English');
    expect(html).not.toContain('Korean');
    expect(html).not.toContain('영어');
  });
});
