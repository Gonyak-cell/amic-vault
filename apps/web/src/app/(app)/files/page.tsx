'use client';

import React from 'react';
import type { DocumentDto, DocumentFolderDto, UploadDocumentResponseDto } from '@amic-vault/shared';
import { Info, PanelLeftOpen, PanelRightOpen, Upload } from 'lucide-react';
import { AiPrepStatusLoader } from '@/components/ai/ai-prep-status-loader';
import { DocumentPreviewDrawer } from '@/components/document/document-preview-drawer';
import { DocumentQuickInspector } from '@/components/document/document-quick-inspector';
import { DocumentUploadDrawer } from '@/components/document/document-upload-drawer';
import type { DocumentUploadCompletionResult } from '@/components/document/document-upload-panel';
import { DocumentVaultList } from '@/components/document/document-vault-list';
import { DocumentWorkbenchRail } from '@/components/document/document-workbench-rail';
import {
  DocumentWorkbenchDrawer,
  DocumentWorkbenchShell,
} from '@/components/document/document-workbench-shell';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { listDocumentFolders } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useSavedItems } from '@/hooks/use-saved-items';
import { matterAppSourceMode, type MatterCodeOption } from '@/lib/matter-app';
import { useI18n } from '@/lib/i18n';

export default function FilesPage() {
  const { t } = useI18n();
  const sourceMode = matterAppSourceMode();
  const savedItems = useSavedItems();
  const [selectedMatter, setSelectedMatter] = React.useState<MatterCodeOption | null>(null);
  const [selectedFolderId, setSelectedFolderId] = React.useState('');
  const [folders, setFolders] = React.useState<DocumentFolderDto[]>([]);
  const [folderError, setFolderError] = React.useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = React.useState<DocumentDto | null>(null);
  const [latestUpload, setLatestUpload] = React.useState<UploadDocumentResponseDto | null>(null);
  const [uploadRevision, setUploadRevision] = React.useState(0);
  const [railOpen, setRailOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const railTriggerRef = React.useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = React.useRef<HTMLButtonElement>(null);
  const uploadTriggerRef = React.useRef<HTMLButtonElement>(null);
  const previewTriggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!selectedMatter) {
      setFolders([]);
      setFolderError(null);
      return;
    }
    let active = true;
    setFolderError(null);
    listDocumentFolders(selectedMatter.matterReference)
      .then((nextFolders) => {
        if (active) setFolders(nextFolders);
      })
      .catch((error) => {
        if (!active) return;
        setFolders([]);
        setFolderError(safeApiErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [selectedMatter]);

  const handleMatterSelected = React.useCallback((matter: MatterCodeOption | null) => {
    setSelectedMatter(matter);
    setSelectedFolderId('');
    setSelectedDocument(null);
  }, []);

  const handleShowAll = React.useCallback(() => {
    setSelectedMatter(null);
    setSelectedFolderId('');
    setSelectedDocument(null);
  }, []);

  const handleDocumentSelected = React.useCallback((document: DocumentDto | null) => {
    setSelectedDocument(document);
    if (!document) setPreviewOpen(false);
  }, []);

  const handleUploadComplete = React.useCallback((result: DocumentUploadCompletionResult) => {
    setLatestUpload(isUploadDocumentResponse(result) ? result : null);
    setUploadRevision((current) => current + 1);
  }, []);

  const rail = (
    <DocumentWorkbenchRail
      folderError={folderError}
      folders={folders}
      onFolderSelected={setSelectedFolderId}
      onMatterSelected={handleMatterSelected}
      onShowAll={handleShowAll}
      selectedFolderId={selectedFolderId}
      selectedMatter={selectedMatter}
      savedItemError={savedItems.error}
      savedItems={savedItems.items}
      savedItemsLoading={savedItems.loading}
      matterSaved={
        selectedMatter ? savedItems.isSaved('matter', selectedMatter.matterReference) : false
      }
      matterSavedBusy={
        selectedMatter ? savedItems.isBusy('matter', selectedMatter.matterReference) : false
      }
      onToggleMatterSaved={
        selectedMatter
          ? () =>
              void savedItems.toggle({
                targetType: 'matter',
                targetId: selectedMatter.matterReference,
                label: selectedMatter.matterName,
                contextLabel: selectedMatter.matterCode,
                href: `/matters/${selectedMatter.matterReference}`,
              })
          : undefined
      }
      sourceMode={sourceMode}
    />
  );

  const inspector = (
    <DocumentQuickInspector
      document={selectedDocument}
      onToggleSaved={(document) =>
        void savedItems.toggle({
          targetType: 'document',
          targetId: document.documentId,
          label: document.title,
          contextLabel:
            [document.matterDisplayCode, document.matterDisplayName].filter(Boolean).join(' · ') ||
            null,
          href: `/documents/${document.documentId}`,
        })
      }
      onPreview={(document) => {
        setSelectedDocument(document);
        setPreviewOpen(true);
      }}
      previewTriggerRef={previewTriggerRef}
      saved={selectedDocument ? savedItems.isSaved('document', selectedDocument.documentId) : false}
      savedBusy={
        selectedDocument ? savedItems.isBusy('document', selectedDocument.documentId) : false
      }
    />
  );

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', t('files.page.title')]}
        title={t('files.page.title')}
        navigation={
          <Button
            ref={uploadTriggerRef}
            className="hidden xl:inline-flex"
            disabled={!selectedMatter}
            onClick={() => setUploadOpen(true)}
            size="sm"
            title={selectedMatter ? '선택한 Matter에 업로드' : 'Matter를 먼저 선택해 주세요.'}
            type="button"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            업로드
          </Button>
        }
      />
      <DocumentWorkbenchShell
        inspector={inspector}
        mobileControls={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={railTriggerRef}
              aria-controls="files-workbench-rail"
              aria-expanded={railOpen}
              onClick={() => setRailOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
              탐색
            </Button>
            <Button
              ref={inspectorTriggerRef}
              aria-controls="files-workbench-inspector"
              aria-expanded={inspectorOpen}
              disabled={!selectedDocument}
              onClick={() => setInspectorOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PanelRightOpen aria-hidden="true" className="h-4 w-4" />
              세부 정보
            </Button>
            <Button
              aria-expanded={uploadOpen}
              disabled={!selectedMatter}
              onClick={() => setUploadOpen(true)}
              size="sm"
              type="button"
            >
              <Upload aria-hidden="true" className="h-4 w-4" />
              업로드
            </Button>
            {!selectedMatter ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info aria-hidden="true" className="h-3.5 w-3.5" />
                Matter 선택 후 업로드할 수 있습니다.
              </span>
            ) : null}
          </div>
        }
        rail={rail}
      >
        <React.Suspense
          fallback={
            <div className="flex min-h-28 items-center justify-center border border-dashed bg-muted/30 text-sm text-muted-foreground">
              전체 문서를 확인하는 중입니다.
            </div>
          }
        >
          <DocumentVaultList
            folders={folders}
            onDocumentSelect={handleDocumentSelected}
            refreshKey={uploadRevision}
            selectedDocumentId={selectedDocument?.documentId ?? null}
            selectedFolderId={selectedFolderId}
            selectedMatter={selectedMatter}
            workbenchContext
          />
        </React.Suspense>
      </DocumentWorkbenchShell>
      <DocumentWorkbenchDrawer
        onClose={() => setRailOpen(false)}
        open={railOpen}
        returnFocusRef={railTriggerRef}
        title="문서 탐색"
      >
        <div id="files-workbench-rail">{rail}</div>
      </DocumentWorkbenchDrawer>
      <DocumentWorkbenchDrawer
        onClose={() => setInspectorOpen(false)}
        open={inspectorOpen}
        returnFocusRef={inspectorTriggerRef}
        side="right"
        title="세부 정보"
      >
        <div id="files-workbench-inspector">{inspector}</div>
      </DocumentWorkbenchDrawer>
      <DocumentUploadDrawer
        onClose={() => setUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
        open={uploadOpen}
        returnFocusRef={uploadTriggerRef}
        selectedMatter={selectedMatter}
        sourceMode={sourceMode}
      />
      <DocumentPreviewDrawer
        document={selectedDocument}
        onClose={() => setPreviewOpen(false)}
        open={previewOpen}
        returnFocusRef={previewTriggerRef}
      />
      {latestUpload?.aiAllowed ? <AiPrepStatusLoader documentId={latestUpload.documentId} /> : null}
    </PageShell>
  );
}

function isUploadDocumentResponse(
  result: DocumentUploadCompletionResult,
): result is UploadDocumentResponseDto {
  return 'aiAllowed' in result;
}
