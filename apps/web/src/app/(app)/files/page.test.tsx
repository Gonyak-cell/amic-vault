import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import type { MatterCodeOption } from '@/lib/matter-app';
import { DocumentPreviewDrawer } from '@/components/document/document-preview-drawer';
import FilesPage from './page';
import {
  matterReferenceForSelection,
  nextUploadRevision,
  previewDocumentIdForSelection,
} from './files-workbench-state';

const previewFrameMock = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('@/components/document/preview-session-frame', () => ({
  PreviewSessionFrame: (props: { documentId: string }) => {
    previewFrameMock.render(props);
    return null;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('FilesPage', () => {
  it('renders the three-pane workbench with a safe Matter-gated upload entry point', () => {
    previewFrameMock.render.mockClear();
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
    expect(previewFrameMock.render).not.toHaveBeenCalled();
  });

  it('advances upload revision for the permission-scoped list refresh', () => {
    expect(nextUploadRevision(0)).toBe(1);
    expect(nextUploadRevision(7)).toBe(8);
  });

  it('keeps folder navigation bound to the selected Matter reference', () => {
    expect(matterReferenceForSelection(matterFixture)).toBe(matterFixture.matterReference);
    expect(matterReferenceForSelection(null)).toBeNull();
  });

  it('keeps preview session creation behind explicit document selection', () => {
    previewFrameMock.render.mockClear();
    const html = renderToStaticMarkup(
      <DocumentPreviewDrawer document={null} onClose={() => undefined} open />,
    );

    expect(html).toBe('');
    expect(previewFrameMock.render).not.toHaveBeenCalled();

    const selectedDocument = documentFixture();
    expect(previewDocumentIdForSelection(selectedDocument, false)).toBeNull();
    expect(previewDocumentIdForSelection(selectedDocument, true)).toBe(selectedDocument.documentId);
    renderToStaticMarkup(
      <DocumentPreviewDrawer document={selectedDocument} onClose={() => undefined} open />,
    );
    expect(previewFrameMock.render).toHaveBeenCalledTimes(1);
    expect(previewFrameMock.render).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: selectedDocument.documentId }),
    );
  });
});

const matterFixture: MatterCodeOption = {
  clientDisplayName: 'AMIC',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  matterReference: '11111111-1111-4111-8111-111111111115',
  practiceGroup: null,
  sourceMode: 'unconfigured',
  status: 'active',
};

function documentFixture(): DocumentDto {
  return {
    aiAllowed: true,
    canViewSensitiveRef: false,
    confidentialityLevel: 'standard',
    createdAt: '2026-07-28T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111101',
    displayName: '투자계약서.pdf',
    documentFamilyId: '11111111-1111-4111-8111-111111111116',
    documentId: '11111111-1111-4111-8111-111111111114',
    documentType: 'contract',
    folderId: '11111111-1111-4111-8111-111111111141',
    folderPath: 'Deal Room/Signing',
    legalHold: false,
    matterDisplayCode: 'AMIC-2026-0001',
    matterDisplayName: 'Investment Advisory',
    matterId: matterFixture.matterReference,
    privilegeStatus: 'none',
    safeLabel: '투자계약서.pdf',
    source: 'internal_work_product',
    status: 'final',
    subtype: null,
    tags: ['executed'],
    tenantId: 'tenant-secret',
    title: '투자계약서.pdf',
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
}
