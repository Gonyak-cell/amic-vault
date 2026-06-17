'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Mail, ShieldCheck, Users } from 'lucide-react';
import type { AiPrepMatterReadinessDto, EmailMatterFilingDto, MatterDto } from '@amic-vault/shared';
import { AiPrepMatterDashboard } from '@/components/ai/ai-prep-matter-dashboard';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { getMatterAiPrepReadiness } from '@/lib/api/ai-prep';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { getMatter, listMatterEmailTimeline } from '@/lib/api-client';

type LoadStatus = 'loading' | 'ready' | 'error';

export default function MatterDetailPage({ params }: { params: { matterId: string } }) {
  const [matter, setMatter] = useState<MatterDto | null>(null);
  const [emails, setEmails] = useState<EmailMatterFilingDto[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [readiness, setReadiness] = useState<AiPrepMatterReadinessDto | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const refreshReadiness = useCallback(() => {
    getMatterAiPrepReadiness(params.matterId)
      .then((result) => {
        setReadiness(result);
        setReadinessError(null);
      })
      .catch((caught) => {
        setReadiness(null);
        setReadinessError(safeApiErrorMessage(caught));
      });
  }, [params.matterId]);

  useEffect(() => {
    let active = true;
    setLoadStatus('loading');
    Promise.all([getMatter(params.matterId), listMatterEmailTimeline(params.matterId)])
      .then(([matterResult, timeline]) => {
        if (!active) return;
        setMatter(matterResult);
        setEmails([...timeline.items]);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setMatter(null);
        setEmails([]);
        setLoadStatus('error');
      });
    getMatterAiPrepReadiness(params.matterId)
      .then((result) => {
        if (!active) return;
        setReadiness(result);
        setReadinessError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setReadiness(null);
        setReadinessError(safeApiErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [params.matterId]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '사건']}
        title={matter?.matterName ?? '사건'}
        description={matter ? matter.matterCode : '권한이 확인된 사건 정보만 표시됩니다.'}
        actions={matter ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/matters/${params.matterId}/team`}>
                <Users className="h-4 w-4" />
                팀 관리
              </Link>
            </Button>
            <MatterStatusBadge status={matter.status} />
          </div>
        ) : undefined}
      />

      {loadStatus === 'error' ? <EmptyState variant="api-error" title="사건을 표시할 수 없습니다." /> : null}

      {matter ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">유형</dt>
            <dd className="mt-1 font-medium">{matter.matterType}</dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">그룹</dt>
            <dd className="mt-1 font-medium">{matter.practiceGroup ?? '표시할 항목이 없습니다.'}</dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">보존 제한</dt>
            <dd className="mt-1 font-medium">{matter.legalHold ? '적용됨' : '없음'}</dd>
          </div>
        </dl>
      ) : null}

      {matter ? (
        <SectionCard icon={<Mail className="h-4 w-4" />} title="보관된 이메일" meta="권한이 확인된 이메일만 표시">
          {emails.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-md border">
              {emails.map((email) => (
                <li key={email.filingId} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]">
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
                          <AlertTriangle className="h-3 w-3" />
                          {code === 'outside_participant' ? '외부 수신자' : '사건 불일치'}
                        </span>
                      ))}
                      {email.privilegeTagSuggestion ? (
                        <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
                          <ShieldCheck className="h-3 w-3" />
                          {email.privilegeTagSuggestion.tag === 'attorney_client_privilege'
                            ? '비밀특권 후보'
                            : '기밀 후보'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <time className="text-xs text-muted-foreground">{new Date(email.filedAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="표시할 이메일이 없습니다." />
          )}
        </SectionCard>
      ) : null}

      {readiness ? <AiPrepMatterDashboard readiness={readiness} onRetryComplete={refreshReadiness} /> : null}
      {readinessError ? <p className="text-sm text-muted-foreground">{readinessError}</p> : null}
    </PageShell>
  );
}
