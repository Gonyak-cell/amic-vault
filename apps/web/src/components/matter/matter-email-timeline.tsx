'use client';

import Link from 'next/link';
import React from 'react';
import { AlertTriangle, FolderInput, Mail, ShieldCheck } from 'lucide-react';
import type { EmailMatterFilingDto, EmailThreadGroupDto } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';

const participantClassLabels = {
  internal: '내부',
  client: '고객',
  opposing: '상대방',
  other_external: '외부',
} as const;

interface MatterEmailTimelineProps {
  emails: readonly EmailMatterFilingDto[];
  threads?: readonly EmailThreadGroupDto[];
  busyThreadId?: string | null;
  onFileThread?: (threadId: string) => void;
}

function emailThreadKey(email: EmailMatterFilingDto): string {
  return email.thread.threadId ?? email.thread.rootMessageHash;
}

function fallbackThreads(emails: readonly EmailMatterFilingDto[]): EmailThreadGroupDto[] {
  const groups = new Map<string, EmailMatterFilingDto[]>();
  for (const email of emails) {
    const key = emailThreadKey(email);
    const group = groups.get(key);
    if (group) {
      group.push(email);
    } else {
      groups.set(key, [email]);
    }
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error('email thread group is empty');
    return {
      threadId: first.thread.threadId,
      rootMessageHash: first.thread.rootMessageHash,
      conversationIdHash: first.thread.conversationIdHash,
      relatedEmailCount: Math.max(
        group.length,
        ...group.map((email) => email.thread.relatedEmailCount + 1),
      ),
      filedEmailCount: group.length,
      documentIds: [...new Set(group.flatMap((email) => email.documentIds))],
      latestFiledAt:
        group.map((email) => email.filedAt).sort((left, right) => right.localeCompare(left))[0] ??
        first.filedAt,
      items: group,
    };
  });
}

function EmailTimelineRow({ email }: { email: EmailMatterFilingDto }) {
  return (
    <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="truncate font-medium">{email.subject ?? '제목 없음'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>문서 {email.documentIds.length}건</span>
          <span>관련 이메일 {email.thread.relatedEmailCount}건</span>
          {email.participantClasses.map((entry) => (
            <span
              key={entry.class}
              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700"
            >
              {participantClassLabels[entry.class]} {entry.count}
            </span>
          ))}
          {email.warningCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {code === 'outside_participant' ? '외부 수신자' : 'Matter 불일치'}
            </span>
          ))}
          {email.privilegeTagSuggestion ? (
            <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {email.privilegeTagSuggestion.tag === 'attorney_client_privilege'
                ? '비밀특권 후보'
                : '기밀 후보'}
            </span>
          ) : null}
        </div>
        {email.documentIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {email.documentIds.map((documentId, index) => (
              <Link
                key={documentId}
                href={`/documents/${documentId}`}
                className="inline-flex min-h-8 items-center rounded border bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                문서 {index + 1} 열기
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <time className="text-xs text-muted-foreground">
        {new Date(email.filedAt).toLocaleString()}
      </time>
    </div>
  );
}

export function MatterEmailTimeline({
  emails,
  threads,
  busyThreadId,
  onFileThread,
}: MatterEmailTimelineProps) {
  const groups = threads && threads.length > 0 ? [...threads] : fallbackThreads(emails);
  return (
    <SectionCard
      icon={<Mail className="h-4 w-4" />}
      title="보관된 이메일"
      meta="접근 가능한 이메일"
    >
      {groups.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-md border">
          {groups.map((thread) => {
            const threadId = thread.threadId;
            return (
              <li key={threadId ?? thread.rootMessageHash}>
                <details open>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    {thread.items[0]?.subject ?? '제목 없음'}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      이메일 {thread.filedEmailCount}건 · 문서 {thread.documentIds.length}건
                    </span>
                  </summary>
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {threadId && onFileThread ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyThreadId === threadId}
                        onClick={() => onFileThread(threadId)}
                      >
                        <FolderInput className="h-4 w-4" aria-hidden />
                        스레드 전체 보관
                      </Button>
                    ) : null}
                  </div>
                  <div className="divide-y border-t bg-background">
                    {thread.items.map((email: EmailMatterFilingDto) => (
                      <EmailTimelineRow key={email.filingId} email={email} />
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="표시할 이메일이 없습니다." />
      )}
    </SectionCard>
  );
}
