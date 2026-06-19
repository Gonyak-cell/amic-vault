'use client';

import React from 'react';
import type { UploadDocumentResponseDto } from '@amic-vault/shared';
import { FileText, FolderUp, Search } from 'lucide-react';
import { AiPrepStatusLoader } from '@/components/ai/ai-prep-status-loader';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { DocumentUploadPanel } from '@/components/document/document-upload-panel';
import { MatterCodePicker } from '@/components/matter/matter-code-picker';
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

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('files.page.title')]}
        title={t('files.page.title')}
        description={t('files.page.description')}
      />
      <SectionCard
        icon={<Search className="h-4 w-4" />}
        title="Matter Code 선택"
        meta="Matter app source-of-truth"
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
        meta="Matter-scoped intake"
      >
        <DocumentUploadPanel
          selectedMatter={selectedMatter}
          sourceMode={sourceMode}
          onUploadComplete={setLatestUpload}
        />
      </SectionCard>
      {latestUpload?.aiAllowed ? (
        <AiPrepStatusLoader documentId={latestUpload.documentId} />
      ) : null}
      <SectionCard
        icon={<FileText className="h-4 w-4" />}
        title={t('files.section.title')}
        meta={t('files.section.meta')}
      >
        <MatterDocumentList selectedMatter={selectedMatter} />
      </SectionCard>
    </PageShell>
  );
}
