'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TriangleAlert, Users } from 'lucide-react';
import type { AiPrepMatterReadinessDto, EmailMatterFilingDto, MatterDto } from '@amic-vault/shared';
import { AiPrepMatterDashboard } from '@/components/ai/ai-prep-matter-dashboard';
import { MatterFileSection } from '@/components/document/matter-file-section';
import {
  MatterGovernanceContextPanel,
  MatterWorkflowOpsPanel,
} from '@/components/governance/governance-context-panel';
import { MatterAuditTimeline } from '@/components/matter/matter-audit-timeline';
import { MatterEmailTimeline } from '@/components/matter/matter-email-timeline';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { MatterWorkspaceActions } from '@/components/matter/matter-workspace-actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
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
        breadcrumbs={['Vault', 'Matter']}
        title={matter?.matterName ?? 'Matter'}
        description={matter ? matter.matterCode : '권한이 확인된 Matter 정보만 표시됩니다.'}
        actions={
          matter ? (
            <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/matters/${params.matterId}/team`}>
                  <Users className="h-4 w-4" />팀 권한
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/walls">
                  <TriangleAlert className="h-4 w-4" />정보 차단
                </Link>
              </Button>
              <MatterWorkspaceActions matter={matter} />
              <MatterStatusBadge status={matter.status} />
            </div>
          ) : undefined
        }
      />

      {loadStatus === 'error' ? (
        <EmptyState variant="api-error" title="Matter를 표시할 수 없습니다." />
      ) : null}

      {matter ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">유형</dt>
            <dd className="mt-1 font-medium">{matter.matterType}</dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">그룹</dt>
            <dd className="mt-1 font-medium">
              {matter.practiceGroup ?? '표시할 항목이 없습니다.'}
            </dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">보존 제한</dt>
            <dd className="mt-1 font-medium">{matter.legalHold ? '적용됨' : '없음'}</dd>
          </div>
        </dl>
      ) : null}

      {matter ? <MatterGovernanceContextPanel matter={matter} readiness={readiness} /> : null}

      {matter ? <MatterAuditTimeline matterId={matter.matterId} /> : null}

      {matter ? <MatterFileSection matter={matter} /> : null}

      {readiness ? (
        <AiPrepMatterDashboard readiness={readiness} onRetryComplete={refreshReadiness} />
      ) : null}
      {readinessError ? <p className="text-sm text-muted-foreground">{readinessError}</p> : null}

      {matter ? <MatterEmailTimeline emails={emails} /> : null}

      {matter ? <MatterWorkflowOpsPanel matter={matter} readiness={readiness} /> : null}
    </PageShell>
  );
}
