import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DocumentDto, DocumentFolderDto } from '@amic-vault/shared';
import { DocumentQuickInspector } from './document-quick-inspector';
import { DocumentWorkbenchRail } from './document-workbench-rail';
import { DocumentWorkbenchDrawer, DocumentWorkbenchShell } from './document-workbench-shell';

const folder: DocumentFolderDto = {
  createdAt: '2026-07-28T00:00:00.000Z',
  folderId: '11111111-1111-4111-8111-111111111141',
  matterId: '11111111-1111-4111-8111-111111111115',
  name: 'Signing',
  parentFolderId: null,
  path: 'Deal Room/Signing',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const documentFixture: DocumentDto = {
  aiAllowed: true,
  canViewSensitiveRef: false,
  confidentialityLevel: 'standard',
  createdAt: '2026-07-28T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111101',
  displayName: '투자계약서.pdf',
  documentFamilyId: '11111111-1111-4111-8111-111111111116',
  documentId: '11111111-1111-4111-8111-111111111114',
  documentType: 'contract',
  folderId: folder.folderId,
  folderPath: folder.path,
  legalHold: false,
  matterDisplayCode: 'AMIC-2026-0001',
  matterDisplayName: 'Investment Advisory',
  matterId: folder.matterId,
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

describe('Document workbench components', () => {
  it('uses the fixed desktop pane contract and an accessible drawer fallback', () => {
    const shell = renderToStaticMarkup(
      <DocumentWorkbenchShell inspector={<p>세부 정보</p>} rail={<p>탐색</p>}>
        <p>목록</p>
      </DocumentWorkbenchShell>,
    );
    const drawer = renderToStaticMarkup(
      <DocumentWorkbenchDrawer onClose={() => undefined} open title="문서 탐색">
        <button type="button">선택</button>
      </DocumentWorkbenchDrawer>,
    );

    expect(shell).toContain('xl:grid-cols-[232px_minmax(520px,1fr)_360px]');
    expect(shell).not.toContain('<main');
    expect(shell).not.toContain('<aside');
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain('문서 탐색 닫기');
  });

  it('shows authorized folder names, not raw folder identifiers, and preserves honest recent-item copy', () => {
    const html = renderToStaticMarkup(
      <DocumentWorkbenchRail
        folders={[folder]}
        onFolderSelected={() => undefined}
        onMatterSelected={() => undefined}
        onShowAll={() => undefined}
        selectedFolderId={folder.folderId}
        selectedMatter={{
          clientDisplayName: 'AMIC',
          matterCode: 'AMIC-2026-0001',
          matterName: 'Investment Advisory',
          matterReference: folder.matterId,
          practiceGroup: null,
          sourceMode: 'unconfigured',
          status: 'active',
        }}
        sourceMode="unconfigured"
      />,
    );

    expect(html).toContain('Signing');
    expect(html).toContain('최근 문서는 권한 범위가 준비되면 표시합니다.');
    expect(html).not.toContain(folder.folderId);
  });

  it('limits the quick inspector to list-safe document metadata', () => {
    const html = renderToStaticMarkup(
      <DocumentQuickInspector document={documentFixture} onPreview={() => undefined} />,
    );

    expect(html).toContain('투자계약서.pdf');
    expect(html).toContain('Deal Room/Signing');
    expect(html).toContain('executed');
    expect(html).toContain('미리보기');
    expect(html).toContain('문서 열기');
    expect(html).not.toContain(documentFixture.tenantId);
  });
});
