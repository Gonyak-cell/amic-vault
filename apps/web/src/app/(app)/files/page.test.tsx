import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import FilesPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('FilesPage', () => {
  it('renders the three-pane workbench with a safe Matter-gated upload entry point', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <FilesPage />
      </LanguageProvider>,
    );

    expect(html).toContain('문서 워크벤치');
    expect(html).toContain('전체 문서');
    expect(html).toContain('문서 탐색');
    expect(html).toContain('Matter 선택 후 업로드할 수 있습니다.');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).toContain('xl:grid-cols-[232px_minmax(520px,1fr)_360px]');
    expect(html).not.toContain('폴더 ID');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('파일 ID');
  });

  it('wires upload completion to refresh the existing permission-scoped list', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toMatch(/setUploadRevision\(\(current\) => current \+ 1\)/);
    expect(source).toContain('refreshKey={uploadRevision}');
    expect(source).toContain('<DocumentUploadDrawer');
    expect(source).toContain('onUploadComplete={handleUploadComplete}');
  });

  it('keeps folder navigation on the existing authorized folder API', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('listDocumentFolders(selectedMatter.matterReference)');
    expect(source).toContain('onDocumentSelect={handleDocumentSelected}');
    expect(source).toContain('workbenchContext');
  });
});
