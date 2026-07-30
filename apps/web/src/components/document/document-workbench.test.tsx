import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentDto, DocumentFolderDto } from '@amic-vault/shared';
import { DocumentQuickInspector } from './document-quick-inspector';
import { DataTable, DataTableBody, DataTableCell, DataTableRow } from '@/components/ui/data-table';
import { DocumentWorkbenchRail } from './document-workbench-rail';
import {
  createDocumentWorkbenchDrawerController,
  DocumentWorkbenchDrawer,
  DocumentWorkbenchShell,
  type DocumentWorkbenchFocusable,
  type DocumentWorkbenchKeyboardEvent,
} from './document-workbench-shell';

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

  it('keeps wide workbench content in an internal scroll region', () => {
    const shell = renderToStaticMarkup(
      <DocumentWorkbenchShell inspector={<p>세부 정보</p>} rail={<p>탐색</p>}>
        <DataTable caption="권한 내 문서함" minWidthClassName="min-w-[920px]">
          <DataTableBody>
            <DataTableRow>
              <DataTableCell>긴 문서명</DataTableCell>
            </DataTableRow>
          </DataTableBody>
        </DataTable>
      </DocumentWorkbenchShell>,
    );
    const drawer = renderToStaticMarkup(
      <DocumentWorkbenchDrawer onClose={() => undefined} open title="문서 탐색">
        <div className="min-w-[1200px]">긴 내용</div>
      </DocumentWorkbenchDrawer>,
    );

    expect(shell).toContain('overflow-x-auto');
    expect(shell).toContain('min-w-[920px]');
    expect(drawer).toContain('min-w-0 flex-1 overflow-x-auto overflow-y-auto');
  });

  it('keeps initial focus, Tab containment, Escape close, and trigger focus return in the drawer contract', () => {
    const preventDefault = vi.fn();
    const onClose = vi.fn();
    const closeButtonFocus = vi.fn();
    const lastFocus = vi.fn();
    const triggerFocus = vi.fn();
    const focusCallbacks: Array<() => void> = [];
    const closeButton: DocumentWorkbenchFocusable = { focus: closeButtonFocus };
    const last: DocumentWorkbenchFocusable = { focus: lastFocus };
    const focusable = [closeButton, last];
    let activeElement: DocumentWorkbenchFocusable | null = closeButton;
    const controller = createDocumentWorkbenchDrawerController({
      getActiveElement: () => activeElement,
      getFocusableElements: () => focusable,
      focusInitial: closeButtonFocus,
      onClose,
      returnFocus: triggerFocus,
      scheduleFocus: (callback) => {
        focusCallbacks.push(callback);
      },
    });

    controller.focusInitial();
    expect(closeButtonFocus).toHaveBeenCalledTimes(1);

    activeElement = last;
    const tabForward: DocumentWorkbenchKeyboardEvent = {
      key: 'Tab',
      preventDefault,
      shiftKey: false,
    };
    controller.onKeyDown(tabForward);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(closeButtonFocus).toHaveBeenCalledTimes(2);

    activeElement = closeButton;
    controller.onKeyDown({ key: 'Tab', preventDefault, shiftKey: true });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(lastFocus).toHaveBeenCalledTimes(1);

    controller.onKeyDown({ key: 'Escape', preventDefault, shiftKey: false });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(triggerFocus).not.toHaveBeenCalled();
    focusCallbacks[0]?.();
    expect(triggerFocus).toHaveBeenCalledTimes(1);
  });

  it('shows authorized folder names without raw identifiers or unsupported recent-item placeholders', () => {
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
    expect(html).not.toContain('최근 문서는 권한 범위가 준비되면 표시합니다.');
    expect(html).not.toContain('접근 가능한 Matter를 선택하면 해당 폴더만 표시합니다.');
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
