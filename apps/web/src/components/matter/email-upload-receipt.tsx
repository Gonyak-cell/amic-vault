import React from 'react';
import type {
  EmailMatterSuggestionDto,
  EmailMatterSuggestionConfidenceBand,
  UploadEmailToMatterResponseDto,
} from '@amic-vault/shared';
import { AlertTriangle, Loader2, MailCheck, MailPlus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';

export interface EmailUploadMatter {
  matterId: string;
  matterCode: string;
  matterName: string;
  clientDisplayName?: string | null;
}

export interface EmailFilingMatterOption extends EmailUploadMatter {
  currentMatter: boolean;
  reasonCodes: EmailMatterSuggestionDto['reasonCodes'];
  score: number;
  confidence: number;
  confidenceBand: EmailMatterSuggestionConfidenceBand | null;
}

export function EmailUploadReceipt({
  busy,
  currentMatter,
  onConfirm,
  onSelectMatter,
  onUndoAutofile,
  selectedMatterId,
  suggestions,
  undoBusyMatterId,
  uploadResult,
}: {
  busy: boolean;
  currentMatter: EmailUploadMatter;
  onConfirm: () => void;
  onSelectMatter: (matterId: string) => void;
  onUndoAutofile?: (matterId: string) => void;
  selectedMatterId: string;
  suggestions: readonly EmailMatterSuggestionDto[];
  undoBusyMatterId?: string | null;
  uploadResult: UploadEmailToMatterResponseDto;
}) {
  const options = emailFilingMatterOptions(currentMatter, suggestions);
  const parseBadge = emailParseStatusLabel(uploadResult);
  return (
    <div className="rounded-md border bg-background">
      <div className="border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">파일링 확인</p>
          {parseBadge ? <StatusBadge tone="warning">{parseBadge}</StatusBadge> : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {uploadResult.email.subject ?? uploadResult.email.rawSha256.slice(0, 12)}
        </p>
      </div>
      <ul className="divide-y">
        {options.map((option) => {
          const selected = option.matterId === selectedMatterId;
          return (
            <li
              key={option.matterId}
              className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{option.matterCode}</span>
                  {option.currentMatter ? <StatusBadge tone="neutral">현재 Matter</StatusBadge> : null}
                  {option.confidenceBand ? (
                    <StatusBadge tone={suggestionBandTone(option.confidenceBand)}>
                      {suggestionBandLabel(option.confidenceBand)}
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-muted-foreground">{option.matterName}</p>
                {option.reasonCodes.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    추천 근거 {option.reasonCodes.map(suggestionReasonLabel).join(', ')}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {option.confidenceBand === 'auto_file' && onUndoAutofile ? (
                  <Button
                    disabled={undoBusyMatterId === option.matterId}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onUndoAutofile(option.matterId)}
                  >
                    {undoBusyMatterId === option.matterId ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    되돌리기
                  </Button>
                ) : null}
                <Button
                  aria-pressed={selected}
                  size="sm"
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  onClick={() => onSelectMatter(option.matterId)}
                >
                  {selected ? (
                    <MailCheck className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <MailPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {selected ? '선택됨' : '선택'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {uploadResult.email.hasOutsideParticipants ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              <span>외부 참여자 포함</span>
            </>
          ) : (
            <span>내부 참여자 기준</span>
          )}
        </div>
        <Button type="button" disabled={busy} onClick={onConfirm}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MailCheck className="h-4 w-4" aria-hidden="true" />
          )}
          파일링 확인
        </Button>
      </div>
    </div>
  );
}

export function emailFilingMatterOptions(
  currentMatter: EmailUploadMatter,
  suggestions: readonly EmailMatterSuggestionDto[],
): EmailFilingMatterOption[] {
  const options: EmailFilingMatterOption[] = [
    {
      ...currentMatter,
      currentMatter: true,
      reasonCodes: [],
      score: 100,
      confidence: 100,
      confidenceBand: null,
    },
  ];
  for (const suggestion of suggestions) {
    if (suggestion.matterId === currentMatter.matterId) continue;
    options.push({
      matterId: suggestion.matterId,
      matterCode: suggestion.matterCode,
      matterName: suggestion.matterName,
      currentMatter: false,
      reasonCodes: suggestion.reasonCodes,
      score: suggestion.score,
      confidence: suggestion.confidence,
      confidenceBand: suggestion.confidenceBand,
    });
  }
  return options;
}

export function emailParseStatusLabel(result: UploadEmailToMatterResponseDto): string | null {
  if (result.email.parser === 'msg' || result.email.parseStatus === 'pending_unsupported') {
    return 'MSG 파싱 대기';
  }
  if (result.email.parseStatus === 'failed') return '메타데이터 확인 필요';
  return null;
}

function suggestionReasonLabel(reason: EmailMatterSuggestionDto['reasonCodes'][number]): string {
  if (reason === 'thread') return '쓰레드';
  if (reason === 'sender_history') return '발신자 이력';
  if (reason === 'participant_domain') return '참여자 도메인';
  if (reason === 'participant_class') return '참여자 분류';
  if (reason === 'subject') return '제목';
  return '상대방 신호';
}

function suggestionBandLabel(band: EmailMatterSuggestionConfidenceBand): string {
  if (band === 'auto_file') return '자동저장';
  if (band === 'confirm') return '확인';
  if (band === 'candidate') return '후보';
  return '수동';
}

function suggestionBandTone(band: EmailMatterSuggestionConfidenceBand): StatusBadgeTone {
  if (band === 'auto_file') return 'success';
  if (band === 'confirm') return 'warning';
  if (band === 'candidate') return 'neutral';
  return 'blocked';
}
