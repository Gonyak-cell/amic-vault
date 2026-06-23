'use client';

import React from 'react';
import type { UploadDocumentResponseDto } from '@amic-vault/shared';
import { FileText, FolderUp, Search } from 'lucide-react';
import { AiPrepStatusLoader } from '@/components/ai/ai-prep-status-loader';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { DocumentVaultList } from '@/components/document/document-vault-list';
import {
  DocumentUploadPanel,
  type DocumentUploadCompletionResult,
} from '@/components/document/document-upload-panel';
import { MatterCodePicker } from '@/components/matter/matter-code-picker';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n } from '@/lib/i18n';
import { matterAppSourceMode, type MatterCodeOption } from '@/lib/matter-app';
import { cn } from '@/lib/utils';

type FilesWorkspaceTab = 'documents' | 'upload';

const filesWorkspaceTabs: Array<{ label: string; value: FilesWorkspaceTab }> = [
  { label: '전체 문서', value: 'documents' },
  { label: 'Matter 업로드', value: 'upload' },
];

export default function FilesPage() {
  const { t } = useI18n();
  const sourceMode = matterAppSourceMode();
  const [initialMatterCode, setInitialMatterCode] = React.useState('');
  const [selectedMatter, setSelectedMatter] = React.useState<MatterCodeOption | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    React.useState<FilesWorkspaceTab>('documents');
  const [latestUpload, setLatestUpload] = React.useState<UploadDocumentResponseDto | null>(null);
  const [uploadRevision, setUploadRevision] = React.useState(0);

  React.useEffect(() => {
    const matterCode = new URLSearchParams(window.location.search).get('matterCode')?.trim() ?? '';
    setInitialMatterCode(matterCode);
    if (matterCode) setActiveWorkspaceTab('upload');
  }, []);

  const handleUploadComplete = React.useCallback((result: DocumentUploadCompletionResult) => {
    setLatestUpload(isUploadDocumentResponse(result) ? result : null);
    setUploadRevision((current) => current + 1);
  }, []);

  const handleMatterSelected = React.useCallback((matter: MatterCodeOption | null) => {
    setSelectedMatter(matter);
  }, []);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('files.page.title')]}
        title={t('files.page.title')}
        description={t('files.page.description')}
        navigation={
          <FilesHeaderTabs activeTab={activeWorkspaceTab} onChange={setActiveWorkspaceTab} />
        }
      />
      {activeWorkspaceTab === 'documents' ? (
        <React.Suspense
          fallback={
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
              전체 문서를 확인하는 중입니다.
            </div>
          }
        >
          <DocumentVaultList refreshKey={uploadRevision} />
        </React.Suspense>
      ) : null}
      {activeWorkspaceTab === 'upload' ? (
        <div id="matter-upload" className="grid gap-4">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <SectionCard
              icon={<Search className="h-4 w-4" />}
              title="Matter Code 선택"
              meta="Matter 원장 기준"
            >
              <MatterCodePicker
                initialMatterCode={initialMatterCode}
                selectedMatter={selectedMatter}
                onMatterSelected={handleMatterSelected}
                sourceMode={sourceMode}
              />
            </SectionCard>
            <SectionCard
              icon={<FolderUp className="h-4 w-4" />}
              title="파일 업로드"
              meta="선택한 Matter에 업로드"
            >
              <DocumentUploadPanel
                selectedMatter={selectedMatter}
                sourceMode={sourceMode}
                onUploadComplete={handleUploadComplete}
              />
            </SectionCard>
          </div>
          {selectedMatter ? (
            <SectionCard
              icon={<FileText className="h-4 w-4" />}
              title="선택한 Matter 문서"
              meta="권한 확인 문서"
            >
              <MatterDocumentList refreshKey={uploadRevision} selectedMatter={selectedMatter} />
            </SectionCard>
          ) : null}
        </div>
      ) : null}
      {latestUpload?.aiAllowed ? <AiPrepStatusLoader documentId={latestUpload.documentId} /> : null}
    </PageShell>
  );
}

function FilesHeaderTabs({
  activeTab,
  onChange,
}: {
  activeTab: FilesWorkspaceTab;
  onChange: (tab: FilesWorkspaceTab) => void;
}) {
  return (
    <div className="relative flex min-w-0 items-end gap-7 overflow-x-auto" role="tablist" aria-label="문서함 보기">
      {filesWorkspaceTabs.map((tab) => {
        const isActive = activeTab === tab.value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              'relative h-12 shrink-0 px-0 text-[17px] font-semibold tracking-normal transition-colors focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            key={tab.value}
            onClick={() => onChange(tab.value)}
            role="tab"
            type="button"
          >
            {tab.label}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function isUploadDocumentResponse(
  result: DocumentUploadCompletionResult,
): result is UploadDocumentResponseDto {
  return 'aiAllowed' in result;
}
