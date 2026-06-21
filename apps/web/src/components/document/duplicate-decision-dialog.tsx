'use client';

import * as React from 'react';
import type { UploadDuplicateCandidateDto } from '@amic-vault/shared';
import { FilePlus, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type DuplicateDecisionSelection =
  | { decision: 'new_document' }
  | { decision: 'new_version'; documentReference: string }
  | { decision: 'cancel' };

export interface DuplicateDecisionDialogProps {
  candidates: UploadDuplicateCandidateDto[];
  fileName: string;
  onSelect: (selection: DuplicateDecisionSelection) => void;
}

export function DuplicateDecisionDialog({
  candidates,
  fileName,
  onSelect,
}: DuplicateDecisionDialogProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedCandidate = candidates[selectedIndex];

  React.useEffect(() => {
    if (selectedIndex >= candidates.length) setSelectedIndex(0);
  }, [candidates.length, selectedIndex]);

  return (
    <div
      aria-labelledby="duplicate-decision-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-xl rounded-md border bg-background shadow-lg">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground" id="duplicate-decision-title">
            중복 문서 처리
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName} 파일과 같은 내용의 문서가 감지되었습니다.
          </p>
        </div>
        <div className="space-y-3 px-4 py-4">
          {candidates.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-muted-foreground">
                새 버전으로 추가할 후보
              </legend>
              {candidates.map((candidate, index) => (
                <label
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  key={`${candidate.title}-${candidate.versionLabel}-${index}`}
                >
                  <input
                    checked={selectedIndex === index}
                    className="mt-1"
                    name="duplicate-candidate"
                    onChange={() => setSelectedIndex(index)}
                    type="radio"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {candidate.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {[candidate.matterCode, candidate.matterName, candidate.versionLabel]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              표시 가능한 후보가 없습니다. 새 문서로 저장하거나 업로드를 취소할 수 있습니다.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onSelect({ decision: 'cancel' })}>
            <X className="h-4 w-4" aria-hidden="true" />
            취소
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSelect({ decision: 'new_document' })}
          >
            <FilePlus className="h-4 w-4" aria-hidden="true" />새 문서로 저장
          </Button>
          <Button
            disabled={!selectedCandidate}
            type="button"
            onClick={() => {
              if (!selectedCandidate) return;
              onSelect({
                decision: 'new_version',
                documentReference: selectedCandidate.documentReference,
              });
            }}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            선택 문서의 새 버전
          </Button>
        </div>
      </div>
    </div>
  );
}
