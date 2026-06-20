import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import FilesPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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
    expect(html).toContain('Matter 원장 기준');
    expect(html).toContain('선택한 Matter에 업로드');
    expect(html).toContain('권한 확인 문서');
    expect(html).toContain('Matter app 연결 필요');
    expect(html).toContain('Matter Code를 먼저 선택해 주세요.');
    expect(html).toContain('Matter Code를 선택하면 파일 목록이 표시됩니다.');
    expect(html).not.toContain('source-of-truth');
    expect(html).not.toContain('Matter-scoped');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('파일 ID');
    expect(html).not.toMatch(/>0</);
  });

  it('wires upload completion to both all-document and selected-Matter refresh paths', () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8');

    expect(source).toMatch(/setUploadRevision\(\(current\) => current \+ 1\)/);
    expect(source).toMatch(/<DocumentVaultList refreshKey=\{uploadRevision\} \/>/);
    expect(source).toMatch(/<MatterDocumentList refreshKey=\{uploadRevision\}/);
  });
});
