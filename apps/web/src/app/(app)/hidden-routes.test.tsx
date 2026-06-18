import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import ContractsPage from './contracts/page';
import DdPage from './dd/page';
import LaunchPage from './launch/page';
import LitigationPage from './litigation/page';
import ScalePage from './scale/page';

describe('hidden production routes', () => {
  it('renders safe blocked states instead of route clients', () => {
    const html = [
      renderToStaticMarkup(
        <LanguageProvider>
          <LaunchPage />
        </LanguageProvider>,
      ),
      renderToStaticMarkup(
        <LanguageProvider>
          <ScalePage />
        </LanguageProvider>,
      ),
      renderToStaticMarkup(
        <LanguageProvider>
          <ContractsPage />
        </LanguageProvider>,
      ),
      renderToStaticMarkup(
        <LanguageProvider>
          <DdPage />
        </LanguageProvider>,
      ),
      renderToStaticMarkup(
        <LanguageProvider>
          <LitigationPage />
        </LanguageProvider>,
      ),
    ].join('\n');

    expect(html).toContain('운영 노출 차단');
    expect(html).toContain('이 화면은 표시할 수 없습니다.');
    expect(html).not.toContain('RFI-001');
    expect(html).not.toContain('EV-001');
    expect(html).not.toContain('FACT-001');
    expect(html).not.toContain('PLD-001');
    expect(html).not.toContain('Witness timeline');
    expect(html).not.toContain('Corporate charter documents');
  });
});
