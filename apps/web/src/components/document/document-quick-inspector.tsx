import * as React from 'react';
import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
import type { DocumentDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  DetailInspector,
  DetailInspectorField,
  DetailInspectorSection,
} from '@/components/ui/detail-inspector';
import { StatusBadge } from '@/components/ui/status-badge';
import { SavedItemToggle } from '@/components/saved-item/saved-item-toggle';
import {
  documentStatusLabels,
  documentTypeLabels,
  formatVaultDocumentDate,
} from './document-vault-list';

export interface DocumentQuickInspectorProps {
  document: DocumentDto | null;
  onPreview: (document: DocumentDto) => void;
  onToggleSaved?: (document: DocumentDto) => void;
  previewTriggerRef?: React.RefObject<HTMLButtonElement>;
  saved?: boolean;
  savedBusy?: boolean;
}

function matterLabel(document: DocumentDto): string {
  return (
    [document.matterDisplayCode, document.matterDisplayName].filter(Boolean).join(' · ') ||
    '표시 정보 없음'
  );
}

export function DocumentQuickInspector({
  document,
  onPreview,
  onToggleSaved,
  previewTriggerRef,
  saved = false,
  savedBusy = false,
}: DocumentQuickInspectorProps) {
  if (!document) {
    return (
      <DetailInspector
        className="h-full rounded-none border-0"
        empty={
          <p className="text-sm leading-6 text-muted-foreground">
            목록에서 문서를 선택하면 안전한 요약 정보가 표시됩니다.
          </p>
        }
        title="세부 정보"
      />
    );
  }

  return (
    <DetailInspector
      actions={
        <>
          {onToggleSaved ? (
            <SavedItemToggle
              busy={savedBusy}
              onToggle={() => onToggleSaved(document)}
              saved={saved}
              targetLabel={document.title}
            />
          ) : null}
          <Button
            ref={previewTriggerRef}
            onClick={() => onPreview(document)}
            size="sm"
            type="button"
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
            미리보기
          </Button>
          <Button asChild size="sm" type="button" variant="outline">
            <Link href={`/documents/${document.documentId}`}>
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              문서 열기
            </Link>
          </Button>
        </>
      }
      className="h-full rounded-none border-0"
      status={
        <StatusBadge tone={document.status === 'final' ? 'success' : 'neutral'}>
          {documentStatusLabels[document.status]}
        </StatusBadge>
      }
      title={document.title}
      {...(document.matterDisplayCode ? { meta: document.matterDisplayCode } : {})}
    >
      <dl className="space-y-4">
        <DetailInspectorSection title="요약">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <DetailInspectorField label="Matter" value={matterLabel(document)} />
            <DetailInspectorField label="폴더" value={document.folderPath?.trim() || '루트'} />
            <DetailInspectorField label="유형" value={documentTypeLabels[document.documentType]} />
            <DetailInspectorField
              label="업데이트"
              value={formatVaultDocumentDate(document.updatedAt)}
            />
          </div>
        </DetailInspectorSection>
        <DetailInspectorSection title="태그">
          {document.tags && document.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {document.tags.map((tag) => (
                <StatusBadge key={tag} tone="neutral">
                  {tag}
                </StatusBadge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">표시할 태그가 없습니다.</p>
          )}
        </DetailInspectorSection>
      </dl>
    </DetailInspector>
  );
}
