import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import DdPage from './dd/page';
import LaunchPage from './launch/page';
import LitigationPage from './litigation/page';
import ScalePage from './scale/page';
import ShowcasePage from '../showcase/page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

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
    ].join('\n');

    expect(html).toContain('운영 노출 차단');
    expect(html).toContain('이 화면은 표시할 수 없습니다.');
  });

  it('keeps showcase unavailable through the not-found boundary', () => {
    expect(() => ShowcasePage()).toThrow('NEXT_NOT_FOUND');
  });

  it('keeps DD and litigation root routes redirected away from standalone browsers', () => {
    expect(() => DdPage()).toThrow('NEXT_REDIRECT:/matters');
    expect(() => LitigationPage()).toThrow('NEXT_REDIRECT:/matters');
  });
});
