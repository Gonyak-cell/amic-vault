'use client';

import * as React from 'react';
import { FolderOpen, FolderTree, FolderUp } from 'lucide-react';
import type {
  EnterpriseApprovedDmsMatterTemplateCatalogDto,
  EnterpriseApprovedDmsMatterTemplateDto,
  MatterDto,
} from '@amic-vault/shared';
import { DocumentUploadPanel } from '@/components/document/document-upload-panel';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { listApprovedEnterpriseDmsMatterTemplates } from '@/lib/api/enterprise';
import {
  matterAppSourceLabels,
  matterAppSourceMode,
  toMatterCodeOption,
  type MatterAppSourceMode,
} from '@/lib/matter-app';

export interface MatterFileSectionProps {
  initialTemplateCatalog?: EnterpriseApprovedDmsMatterTemplateCatalogDto | undefined;
  matter: MatterDto;
  sourceMode?: MatterAppSourceMode;
}

interface FilingContextRow {
  label: string;
  value: string;
  tone?: StatusBadgeTone;
}

const matterStatusLabels: Record<string, string> = {
  proposed: '제안',
  open: '진행',
  active: '활성',
  closing: '종결 준비',
  closed: '종결',
  archived: '보관',
  disposal_review: '폐기 검토',
  disposed: '폐기',
};

function matterStatusLabel(status: string): string {
  return matterStatusLabels[status] ?? status;
}

function sourceModeTone(sourceMode: MatterAppSourceMode): StatusBadgeTone {
  return sourceMode === 'matter_app_api' || sourceMode === 'matter_app_event_projection'
    ? 'success'
    : 'warning';
}

function FilingContextRows({ rows }: { rows: FilingContextRow[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="min-h-[72px] rounded-md border bg-background px-3 py-2.5">
          <dt className="truncate text-[11px] font-medium text-muted-foreground">{row.label}</dt>
          <dd className="mt-2 min-w-0 text-[13px] font-semibold text-foreground">
            {row.tone ? (
              <StatusBadge tone={row.tone} className="max-w-full">
                <span className="truncate">{row.value}</span>
              </StatusBadge>
            ) : (
              <span className="block truncate">{row.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MatterTemplateDocumentSets({
  template,
}: {
  template: EnterpriseApprovedDmsMatterTemplateDto | null;
}) {
  if (!template) return null;
  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">문서 세트 계약</p>
          <p className="mt-1 truncate text-[12px] text-muted-foreground">{template.displayName}</p>
        </div>
        <StatusBadge tone="success">승인됨</StatusBadge>
      </div>
      <dl className="mt-3 grid gap-2 md:grid-cols-2">
        {template.documentSets.map((documentSet) => (
          <div key={documentSet.setKey} className="rounded-md border bg-background px-3 py-2">
            <dt className="truncate text-[12px] font-semibold text-foreground">
              {documentSet.displayName}
            </dt>
            <dd className="mt-1 text-[12px] text-muted-foreground">
              {documentSet.documentTypeCodes.join(', ')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MatterFileSection({
  initialTemplateCatalog,
  matter,
  sourceMode,
}: MatterFileSectionProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const [uploadRevision, setUploadRevision] = React.useState(0);
  const [templateCatalog, setTemplateCatalog] =
    React.useState<EnterpriseApprovedDmsMatterTemplateCatalogDto | null>(
      initialTemplateCatalog ?? null,
    );
  React.useEffect(() => {
    if (initialTemplateCatalog) {
      setTemplateCatalog(initialTemplateCatalog);
      return;
    }
    let cancelled = false;
    void listApprovedEnterpriseDmsMatterTemplates(matter.matterType)
      .then((catalog) => {
        if (!cancelled) setTemplateCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setTemplateCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initialTemplateCatalog, matter.matterType]);
  const matterOption = React.useMemo(
    () => toMatterCodeOption(matter, resolvedSourceMode),
    [matter, resolvedSourceMode],
  );
  const matterLabel = matter.safeLabel ?? matter.displayName ?? matter.matterName;
  const approvedTemplate =
    templateCatalog?.templates.find((template) => template.matterType === matter.matterType) ?? null;
  const filingRows: FilingContextRow[] = [
    { label: 'Matter Code', value: matter.matterCode },
    { label: 'Matter', value: matterLabel },
    { label: '업무 그룹', value: matter.practiceGroup ?? '미지정' },
    { label: 'Matter 상태', value: matterStatusLabel(matter.status) },
    {
      label: 'Matter 원장',
      value: matterAppSourceLabels[resolvedSourceMode],
      tone: sourceModeTone(resolvedSourceMode),
    },
    {
      label: 'Legal Hold',
      value: matter.legalHold ? '적용' : '미적용',
      tone: matter.legalHold ? 'warning' : 'success',
    },
    { label: '파일링 모델', value: 'Matter 메타데이터 기준', tone: 'success' },
    {
      label: '폴더 모델',
      value: approvedTemplate ? '문서 세트 계약' : '미적용',
      tone: approvedTemplate ? 'success' : 'neutral',
    },
  ];

  return (
    <>
      <SectionCard
        icon={<FolderTree className="h-4 w-4" />}
        title="파일링 기준"
        meta="Matter 메타데이터"
      >
        <FilingContextRows rows={filingRows} />
        <MatterTemplateDocumentSets template={approvedTemplate} />
      </SectionCard>
      <SectionCard
        icon={<FolderOpen className="h-4 w-4" />}
        title="파일"
        meta="Matter 범위 목록"
      >
        <MatterDocumentList refreshKey={uploadRevision} selectedMatter={matterOption} />
      </SectionCard>
      <SectionCard
        icon={<FolderUp className="h-4 w-4" />}
        title="파일 업로드"
        meta="Matter Code 확인 후 업로드"
      >
        <DocumentUploadPanel
          selectedMatter={matterOption}
          sourceMode={resolvedSourceMode}
          onUploadComplete={() => setUploadRevision((current) => current + 1)}
        />
      </SectionCard>
    </>
  );
}
