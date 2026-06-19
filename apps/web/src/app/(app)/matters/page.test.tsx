import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import MattersPage from './page';

vi.mock('@/lib/api-client', () => ({
  listMatters: vi.fn(),
}));

describe('MattersPage', () => {
  it('surfaces the file upload and organization prep path without mock counts', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <MattersPage />
      </LanguageProvider>,
    );

    expect(html).toContain('파일 업로드');
    expect(html).toContain('업로드 후 파일 정리 준비');
    expect(html).toContain('파일 개요, 주요 정보, 키워드, 보관 위치 제안');
    expect(html).toContain('href="/files"');
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });
});
