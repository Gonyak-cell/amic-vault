'use client';

import * as React from 'react';
import { FolderOpen, FolderUp } from 'lucide-react';
import type { MatterDto } from '@amic-vault/shared';
import { DocumentUploadPanel } from '@/components/document/document-upload-panel';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { SectionCard } from '@/components/ui/section-card';
import { matterAppSourceMode, toMatterCodeOption, type MatterAppSourceMode } from '@/lib/matter-app';

export interface MatterFileSectionProps {
  matter: MatterDto;
  sourceMode?: MatterAppSourceMode;
}

export function MatterFileSection({ matter, sourceMode }: MatterFileSectionProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const matterOption = React.useMemo(
    () => toMatterCodeOption(matter, resolvedSourceMode),
    [matter, resolvedSourceMode],
  );

  return (
    <>
      <SectionCard
        icon={<FolderOpen className="h-4 w-4" />}
        title="파일"
        meta="Matter-scoped browse"
      >
        <MatterDocumentList selectedMatter={matterOption} />
      </SectionCard>
      <SectionCard
        icon={<FolderUp className="h-4 w-4" />}
        title="파일 업로드"
        meta="Matter Code-bound intake"
      >
        <DocumentUploadPanel selectedMatter={matterOption} sourceMode={resolvedSourceMode} />
      </SectionCard>
    </>
  );
}
