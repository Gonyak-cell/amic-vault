import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import FilesPage from './page';

describe('FilesPage', () => {
  it('requires Matter Code selection before file upload and keeps file list empty until connected', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <FilesPage />
      </LanguageProvider>,
    );

    expect(html).toContain('문서함');
    expect(html).toContain('전체 문서');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).toContain('파일 업로드');
    expect(html).toContain('Matter 업로드');
    expect(html).toContain('Matter Code 선택');
    expect(html).toContain('Matter app 연결 필요');
    expect(html).toContain('Matter Code를 먼저 선택해 주세요.');
    expect(html).toContain('Matter Code를 선택하면 파일 목록이 표시됩니다.');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('파일 ID');
    expect(html).not.toMatch(/>0</);
  });
});
