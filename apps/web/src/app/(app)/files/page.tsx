'use client';

import React from 'react';
import type { UploadDocumentResponseDto } from '@amic-vault/shared';
import { FileText, FolderUp, Search } from 'lucide-react';
import { AiPrepStatusLoader } from '@/components/ai/ai-prep-status-loader';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { DocumentVaultList } from '@/components/document/document-vault-list';
import { DocumentUploadPanel } from '@/components/document/document-upload-panel';
import { MatterCodePicker } from '@/components/matter/matter-code-picker';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n } from '@/lib/i18n';
import { matterAppSourceMode, type MatterCodeOption } from '@/lib/matter-app';

export default function FilesPage() {
  const { t } = useI18n();
  const sourceMode = matterAppSourceMode();
  const [selectedMatter, setSelectedMatter] = React.useState<MatterCodeOption | null>(null);
  const [latestUpload, setLatestUpload] = React.useState<UploadDocumentResponseDto | null>(null);
  const [uploadRevision, setUploadRevision] = React.useState(0);

  const handleUploadComplete = React.useCallback((result: UploadDocumentResponseDto) => {
    setLatestUpload(result);
    setUploadRevision((current) => current + 1);
  }, []);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('files.page.title')]}
        title={t('files.page.title')}
        description={t('files.page.description')}
        actions={
          <Button asChild>
            <a href="#matter-upload">
              <FolderUp className="h-4 w-4" />
              파일 업로드
            </a>
          </Button>
        }
      />
      <SectionCard
        icon={<FileText className="h-4 w-4" />}
        title={t('files.section.title')}
        meta={t('files.section.meta')}
      >
        <React.Suspense
          fallback={
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
              전체 문서를 확인하는 중입니다.
            </div>
          }
        >
          <DocumentVaultList />
        </React.Suspense>
      </SectionCard>
      <PageHeader
        id="matter-upload"
        breadcrumbs={['Vault', t('files.page.title'), '업로드']}
        title="Matter 업로드"
        description="파일은 Matter Code가 확인된 뒤 해당 Matter 권한 범위 안에서 업로드됩니다."
      />
      <SectionCard
        icon={<Search className="h-4 w-4" />}
        title="Matter Code 선택"
        meta="Matter 원장 기준"
      >
        <MatterCodePicker
          selectedMatter={selectedMatter}
          onMatterSelected={setSelectedMatter}
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
      {latestUpload?.aiAllowed ? (
        <AiPrepStatusLoader documentId={latestUpload.documentId} />
      ) : null}
      <SectionCard
        icon={<FileText className="h-4 w-4" />}
        title="선택한 Matter 문서"
        meta="권한 확인 문서"
      >
        <MatterDocumentList refreshKey={uploadRevision} selectedMatter={selectedMatter} />
      </SectionCard>
    </PageShell>
  );
}
