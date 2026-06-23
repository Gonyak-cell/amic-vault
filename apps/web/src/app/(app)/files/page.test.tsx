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
    expect(html).toContain('문서함 보기');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).toContain('Matter 업로드');
    expect(html).not.toContain('파일 업로드');
    expect(html).not.toContain('Matter 업로드 단계');
    expect(html).not.toContain('Matter Code 미선택');
    expect(html).not.toContain('Matter Code를 먼저 선택해 주세요.');
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
    expect(source).toMatch(/setActiveWorkspaceTab\('upload'\)/);
  });
});
