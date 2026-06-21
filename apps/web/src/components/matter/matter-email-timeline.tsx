'use client';

import Link from 'next/link';
import React from 'react';
import { AlertTriangle, Mail, ShieldCheck } from 'lucide-react';
import type { EmailMatterFilingDto } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';

export function MatterEmailTimeline({ emails }: { emails: readonly EmailMatterFilingDto[] }) {
  return (
    <SectionCard
      icon={<Mail className="h-4 w-4" />}
      title="보관된 이메일"
      meta="권한이 확인된 이메일만 표시"
    >
      {emails.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-md border">
          {emails.map((email) => (
            <li
              key={email.filingId}
              className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{email.subject ?? '표시 가능한 제목 없음'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>문서 {email.documentIds.length}건</span>
                  <span>관련 이메일 {email.thread.relatedEmailCount}건</span>
                  {email.warningCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {code === 'outside_participant' ? '외부 수신자' : '사건 불일치'}
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
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="표시할 이메일이 없습니다." />
      )}
    </SectionCard>
  );
}
