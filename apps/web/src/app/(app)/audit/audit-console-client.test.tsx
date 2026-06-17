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

    expect(html).toContain('고급 참조 필터');
    expect(html).toContain('CSV 내보내기');
    expect(html).not.toContain('수행자 ID');
    expect(html).not.toContain('대상 ID');
    expect(html).not.toContain('Matter ID');
  });
});
