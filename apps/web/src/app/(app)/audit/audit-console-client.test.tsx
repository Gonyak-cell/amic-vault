import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { AuditConsoleClient } from './audit-console-client';

describe('AuditConsoleClient', () => {
  it('keeps raw reference filters out of the primary audit UI copy', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AuditConsoleClient />
      </LanguageProvider>,
    );

    expect(html).toContain('aria-label="활동 기록 필터"');
    expect(html).toContain('for="audit-action-filter"');
    expect(html).toContain('for="audit-result-filter"');
    expect(html).toContain('고급 감사 조건');
    expect(html).toContain('CSV 내보내기');
    expect(html).toContain('감사 무결성');
    expect(html).toContain('확인 중');
    expect(html).toContain('보관 영수증');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('수행자 ID');
    expect(html).not.toContain('대상 ID');
    expect(html).not.toContain('Matter ID');
  });
});
