'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Brain,
  CalendarDays,
  CheckCircle2,
  FileText,
  Link2,
  MailPlus,
  Plus,
  Scale,
  Share2,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type {
  AiPrepMatterReadinessDto,
  EmailMatterFilingDto,
  EmailThreadGroupDto,
  MatterDashboardDto,
  MatterDto,
  MatterRelatedMatterDto,
  MatterRelationType,
} from '@amic-vault/shared';
import { AiAssistantPanel } from '@/components/ai/ai-assistant-panel';
import { AiPrepMatterDashboard } from '@/components/ai/ai-prep-matter-dashboard';
import { MatterFileSection } from '@/components/document/matter-file-section';
import {
  MatterGovernanceContextPanel,
  MatterWorkflowOpsPanel,
} from '@/components/governance/governance-context-panel';
import { MatterAuditTimeline } from '@/components/matter/matter-audit-timeline';
import { MatterClosingChecklistPanel } from '@/components/matter/matter-closing-checklist-panel';
import { MatterConflictsPanel } from '@/components/matter/matter-conflicts-panel';
import { EmailUploadCard } from '@/components/matter/email-upload-card';
import { MatterEmailTimeline } from '@/components/matter/matter-email-timeline';
import { MatterIssuesKeyDatesPanel } from '@/components/matter/matter-issues-key-dates-panel';
import { MatterKnowledgeTab } from '@/components/matter/matter-knowledge-tab';
import { MatterPartyPanel } from '@/components/matter/matter-party-panel';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { MatterWorkstreamTabs } from '@/components/matter/matter-workstream-tabs';
import { MatterWorkspaceActions } from '@/components/matter/matter-workspace-actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { getMatterAiPrepReadiness } from '@/lib/api/ai-prep';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  addMatterRelatedMatter,
  fileEmailThreadToMatter,
  getMatter,
  getMatterDashboard,
  listMatterEmailTimeline,
  listMatterRelatedMatters,
  listMatters,
  removeMatterRelatedMatter,
} from '@/lib/api-client';

type LoadStatus = 'loading' | 'ready' | 'error';

export default function MatterDetailPage({
  params,
  searchParams,
}: {
  params: { matterId: string };
  searchParams?: { created?: string };
}) {
  const [matter, setMatter] = useState<MatterDto | null>(null);
  const [emails, setEmails] = useState<EmailMatterFilingDto[]>([]);
  const [emailThreads, setEmailThreads] = useState<EmailThreadGroupDto[]>([]);
  const [relatedMatters, setRelatedMatters] = useState<MatterRelatedMatterDto[]>([]);
  const [matterOptions, setMatterOptions] = useState<MatterDto[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [dashboard, setDashboard] = useState<MatterDashboardDto | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<AiPrepMatterReadinessDto | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [selectedRelatedMatterId, setSelectedRelatedMatterId] = useState('');
  const [selectedRelationType, setSelectedRelationType] = useState<MatterRelationType>('parallel');
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [emailThreadBusyId, setEmailThreadBusyId] = useState<string | null>(null);

  const refreshEmails = useCallback(() => {
    listMatterEmailTimeline(params.matterId)
      .then((timeline) => {
        setEmails([...timeline.items]);
        setEmailThreads([...(timeline.threads ?? [])]);
      })
      .catch(() => {
        setEmails([]);
        setEmailThreads([]);
      });
  }, [params.matterId]);

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

  const refreshRelatedMatters = useCallback(() => {
    listMatterRelatedMatters(params.matterId)
      .then((result) => setRelatedMatters(result.items))
      .catch(() => setRelatedMatters([]));
  }, [params.matterId]);

  useEffect(() => {
    let active = true;
    setLoadStatus('loading');
    Promise.all([getMatter(params.matterId), listMatterEmailTimeline(params.matterId)])
      .then(([matterResult, timeline]) => {
        if (!active) return;
        setMatter(matterResult);
        setEmails([...timeline.items]);
        setEmailThreads([...(timeline.threads ?? [])]);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setMatter(null);
        setEmails([]);
        setEmailThreads([]);
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
    getMatterDashboard(params.matterId)
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        setDashboardError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setDashboard(null);
        setDashboardError(safeApiErrorMessage(caught));
      });
    listMatterRelatedMatters(params.matterId)
      .then((result) => {
        if (!active) return;
        setRelatedMatters(result.items);
      })
      .catch(() => {
        if (!active) return;
        setRelatedMatters([]);
      });
    listMatters({ pageSize: 100 })
      .then((result) => {
        if (!active) return;
        setMatterOptions(result.items.filter((item) => item.matterId !== params.matterId));
      })
      .catch(() => {
        if (!active) return;
        setMatterOptions([]);
      });
    return () => {
      active = false;
    };
  }, [params.matterId]);

  const createdFromIntake = searchParams?.created === '1';

  async function addRelatedMatter() {
    if (!selectedRelatedMatterId || relatedBusy) return;
    setRelatedBusy(true);
    try {
      const result = await addMatterRelatedMatter(params.matterId, {
        relatedMatterId: selectedRelatedMatterId,
        relationType: selectedRelationType,
      });
      setRelatedMatters(result.items);
      setSelectedRelatedMatterId('');
    } catch {
      refreshRelatedMatters();
    } finally {
      setRelatedBusy(false);
    }
  }

  async function removeRelatedMatter(item: MatterRelatedMatterDto) {
    if (relatedBusy) return;
    setRelatedBusy(true);
    try {
      const result = await removeMatterRelatedMatter(
        params.matterId,
        item.relatedMatterId,
        item.relationType,
      );
      setRelatedMatters(result.items);
    } catch {
      refreshRelatedMatters();
    } finally {
      setRelatedBusy(false);
    }
  }

  async function fileEmailThread(threadId: string) {
    if (emailThreadBusyId) return;
    setEmailThreadBusyId(threadId);
    try {
      const timeline = await fileEmailThreadToMatter(threadId, { matterId: params.matterId });
      setEmails([...timeline.items]);
      setEmailThreads([...(timeline.threads ?? [])]);
    } catch {
      refreshEmails();
    } finally {
      setEmailThreadBusyId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter']}
        title={matter?.matterName ?? 'Matter'}
        description={
          matter
            ? [matter.matterCode, matter.clientDisplayName].filter(Boolean).join(' · ')
            : '권한이 확인된 Matter 정보만 표시됩니다.'
        }
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
                  <TriangleAlert className="h-4 w-4" />
                  정보 차단
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

      {createdFromIntake ? (
        <section className="rounded-md border bg-card px-4 py-3" aria-label="Matter 생성 다음 단계">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Matter가 생성되었습니다.</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Conflicts 패널에서 이해상충 검토를 실행하고 해소한 뒤 Matter를 열 수 있습니다.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href="#matter-conflicts">Conflicts 패널로 이동</a>
            </Button>
          </div>
        </section>
      ) : null}

      {matter ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">고객</dt>
            <dd className="mt-1 font-medium">{matter.clientDisplayName ?? '고객 표시명 없음'}</dd>
          </div>
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
            <dt className="text-xs uppercase text-muted-foreground">보안 등급</dt>
            <dd className="mt-1 font-medium">
              {matterConfidentialityLabels[matter.confidentialityLevel]}
              {matter.ethicalWallActive ? ' · Wall 활성' : ''}
            </dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">보존 제한</dt>
            <dd className="mt-1 font-medium">{matter.legalHold ? '적용됨' : '없음'}</dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">리드 파트너</dt>
            <dd className="mt-1 font-medium">
              {matter.leadPartnerDisplayName ?? matter.leadLawyerDisplayName ?? '미지정'}
            </dd>
          </div>
          <div className="rounded-md border bg-card p-3">
            <dt className="text-xs uppercase text-muted-foreground">리드 어소</dt>
            <dd className="mt-1 font-medium">{matter.leadAssociateDisplayName ?? '미지정'}</dd>
          </div>
        </dl>
      ) : null}

      {matter ? (
        <MatterDashboardPanel matterId={matter.matterId} dashboard={dashboard} error={dashboardError} />
      ) : null}

      {matter ? (
        <div id="matter-workstreams">
          <MatterWorkstreamTabs matterId={matter.matterId} />
        </div>
      ) : null}

      {matter ? (
        <MatterKnowledgeTab
          matterId={matter.matterId}
          latestSessionId={dashboard?.aiSessions[0]?.sessionId ?? null}
        />
      ) : null}

      {matter ? (
        <SectionCard
          icon={<Link2 className="h-4 w-4" />}
          title="관련 Matter"
          meta={
            matter.ethicalWallActive
              ? '정보 차단 활성'
              : matterConfidentialityLabels[matter.confidentialityLevel]
          }
        >
          <MatterRelationsPanel
            matterOptions={matterOptions}
            relatedMatters={relatedMatters}
            selectedRelatedMatterId={selectedRelatedMatterId}
            selectedRelationType={selectedRelationType}
            busy={relatedBusy}
            onSelectMatter={setSelectedRelatedMatterId}
            onSelectRelation={setSelectedRelationType}
            onAdd={() => void addRelatedMatter()}
            onRemove={(item) => void removeRelatedMatter(item)}
          />
        </SectionCard>
      ) : null}

      {matter ? (
        <div id="matter-issues">
          <SectionCard
            icon={<CalendarDays className="h-4 w-4" />}
            title="쟁점·기한"
            meta={matter.matterType}
          >
            <MatterIssuesKeyDatesPanel matterId={matter.matterId} />
          </SectionCard>
        </div>
      ) : null}

      {matter ? (
        <div id="matter-conflicts">
          <MatterConflictsPanel matter={matter} onMatterUpdated={setMatter} />
        </div>
      ) : null}

      {matter ? (
        <div id="matter-closing">
          <MatterClosingChecklistPanel matter={matter} onMatterUpdated={setMatter} />
        </div>
      ) : null}

      {matter ? (
        <MatterGovernanceContextPanel
          matter={matter}
          onMatterUpdated={setMatter}
          readiness={readiness}
        />
      ) : null}

      {matter ? <MatterPartyPanel matter={matter} /> : null}

      {matter ? (
        <div id="matter-activity">
          <MatterAuditTimeline matterId={matter.matterId} />
        </div>
      ) : null}

      {matter ? (
        <div id="matter-files">
          <MatterFileSection matter={matter} />
        </div>
      ) : null}

      {readiness ? (
        <AiPrepMatterDashboard readiness={readiness} onRetryComplete={refreshReadiness} />
      ) : null}
      {readinessError ? <p className="text-sm text-muted-foreground">{readinessError}</p> : null}

      {matter ? (
        <div id="matter-ai">
          <AiAssistantPanel matterId={matter.matterId} />
        </div>
      ) : null}

      {matter ? (
        <SectionCard
          icon={<MailPlus className="h-4 w-4" />}
          title="이메일 업로드"
          meta="EML·MSG 원문 보관"
        >
          <EmailUploadCard matter={matterToEmailUploadMatter(matter)} onFiled={refreshEmails} />
        </SectionCard>
      ) : null}

      {matter ? (
        <MatterEmailTimeline
          emails={emails}
          threads={emailThreads}
          busyThreadId={emailThreadBusyId}
          onFileThread={(threadId) => void fileEmailThread(threadId)}
        />
      ) : null}

      {matter ? <MatterWorkflowOpsPanel matter={matter} readiness={readiness} /> : null}
    </PageShell>
  );
}

function MatterDashboardPanel({
  matterId,
  dashboard,
  error,
}: {
  matterId: string;
  dashboard: MatterDashboardDto | null;
  error: string | null;
}) {
  const latestActivity = dashboard?.recentActivity[0];
  const firstDocument = dashboard?.keyDocuments[0];
  const firstDate = dashboard?.upcomingKeyDates[0];
  const latestExternal = dashboard?.externalActivity[0];
  const latestAiSession = dashboard?.aiSessions[0];
  const activeLinks = dashboard
    ? dashboard.externalActivity.reduce((sum, item) => sum + item.activeLinkCount, 0)
    : 0;
  const accessCount = dashboard
    ? dashboard.externalActivity.reduce((sum, item) => sum + item.accessCount, 0)
    : 0;
  const cards = [
    {
      title: '최근 활동',
      value: dashboard ? String(dashboard.recentActivity.length) : '...',
      detail: latestActivity
        ? `${latestActivity.actionLabel} · ${latestActivity.resultLabel}`
        : dashboard
          ? '활동 없음'
          : '집계 중',
      href: '#matter-activity',
      icon: Activity,
    },
    {
      title: '핵심 문서',
      value: dashboard ? String(dashboard.keyDocuments.length) : '...',
      detail: firstDocument
        ? [firstDocument.title, firstDocument.versionLabel ?? firstDocument.versionSignificance]
            .filter(Boolean)
            .join(' · ')
        : dashboard
          ? '문서 없음'
          : '집계 중',
      href: '#matter-files',
      icon: FileText,
    },
    {
      title: '쟁점',
      value: dashboard ? String(dashboard.issueSummary.openCount) : '...',
      detail: dashboard
        ? riskLabel(dashboard.issueSummary.highestRiskLevel)
        : '집계 중',
      href: '#matter-issues',
      icon: Scale,
    },
    {
      title: '기한',
      value: dashboard ? String(dashboard.upcomingKeyDates.length) : '...',
      detail: firstDate ? `${firstDate.dueDate} · ${firstDate.title}` : dashboard ? '기한 없음' : '집계 중',
      href: '#matter-issues',
      icon: CalendarDays,
    },
    {
      title: '외부 활동',
      value: dashboard ? String(dashboard.externalActivity.length) : '...',
      detail: latestExternal
        ? `링크 ${activeLinks} · 접근 ${accessCount}`
        : dashboard
          ? '외부 활동 없음'
          : '집계 중',
      href: `/audit?matterId=${encodeURIComponent(matterId)}`,
      icon: Share2,
    },
    {
      title: 'AI 세션',
      value: dashboard ? String(dashboard.aiSessions.length) : '...',
      detail: latestAiSession
        ? `${aiSessionStatusLabel(latestAiSession.status)} · ${latestAiSession.policySummary}`
        : dashboard
          ? '세션 없음'
          : '집계 중',
      href: '#matter-ai',
      icon: Brain,
    },
  ];

  return (
    <section id="matter-dashboard" className="grid gap-3" aria-label="Matter 업무 대시보드">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">업무 대시보드</h2>
          <p className="text-xs text-muted-foreground">
            {dashboard ? `집계 ${formatDashboardTime(dashboard.generatedAt)}` : '집계 중'}
          </p>
        </div>
        {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="truncate text-sm font-medium text-foreground">{card.title}</p>
                </div>
                <Button asChild variant="ghost" size="sm" title={`${card.title} 열기`}>
                  <a href={card.href} aria-label={`${card.title} 열기`}>
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <div className="mt-3 grid gap-1">
                <p className="text-2xl font-semibold leading-none text-foreground">{card.value}</p>
                <p className="truncate text-xs text-muted-foreground">{card.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function matterToEmailUploadMatter(matter: MatterDto) {
  return {
    matterId: matter.matterId,
    matterCode: matter.matterCode,
    matterName: matter.matterName,
    clientDisplayName: matter.clientDisplayName ?? null,
  };
}

const matterConfidentialityLabels = {
  standard: '표준',
  high: '높음',
  restricted: '제한',
} as const satisfies Record<MatterDto['confidentialityLevel'], string>;

const matterRelationLabels = {
  preceding: '선행',
  parallel: '병행',
  subsequent: '후속',
} as const satisfies Record<MatterRelationType, string>;

function riskLabel(value: MatterDashboardDto['issueSummary']['highestRiskLevel']): string {
  if (value === 'critical') return '최고 위험 critical';
  if (value === 'high') return '최고 위험 high';
  if (value === 'medium') return '최고 위험 medium';
  if (value === 'low') return '최고 위험 low';
  return '열린 쟁점 없음';
}

function aiSessionStatusLabel(value: string): string {
  if (value === 'submitted') return '요청됨';
  if (value === 'retrieved') return '근거 수집';
  if (value === 'responded') return '응답 완료';
  if (value === 'blocked') return '차단';
  if (value === 'failed') return '실패';
  return '확인 필요';
}

function formatDashboardTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function MatterRelationsPanel({
  matterOptions,
  relatedMatters,
  selectedRelatedMatterId,
  selectedRelationType,
  busy,
  onSelectMatter,
  onSelectRelation,
  onAdd,
  onRemove,
}: {
  matterOptions: MatterDto[];
  relatedMatters: MatterRelatedMatterDto[];
  selectedRelatedMatterId: string;
  selectedRelationType: MatterRelationType;
  busy: boolean;
  onSelectMatter: (matterId: string) => void;
  onSelectRelation: (relationType: MatterRelationType) => void;
  onAdd: () => void;
  onRemove: (item: MatterRelatedMatterDto) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_auto]">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selectedRelatedMatterId}
          disabled={busy}
          onChange={(event) => onSelectMatter(event.target.value)}
          aria-label="관련 Matter 선택"
        >
          <option value="">관련 Matter 선택</option>
          {matterOptions.map((matter) => (
            <option key={matter.matterId} value={matter.matterId}>
              {matter.matterCode} · {matter.matterName}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selectedRelationType}
          disabled={busy}
          onChange={(event) => onSelectRelation(event.target.value as MatterRelationType)}
          aria-label="관련 Matter 관계"
        >
          {Object.entries(matterRelationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={!selectedRelatedMatterId || busy} onClick={onAdd}>
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>
      <div className="grid gap-2">
        {relatedMatters.map((item) => (
          <div
            key={`${item.linkId}:${item.relationType}`}
            className="flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {matterRelationLabels[item.relationType]}
                </span>
                <span className="truncate text-sm font-semibold">
                  {item.canReadRelatedMatter
                    ? item.relatedMatterName
                    : (item.safeLabel ?? '권한 제한 Matter')}
                </span>
              </div>
              {item.canReadRelatedMatter ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.relatedMatterCode, item.relatedMatterType, item.relatedMatterStatus]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  매터명은 권한 확인 후 표시됩니다.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {item.canReadRelatedMatter ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/matters/${item.relatedMatterId}`}>열기</Link>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                title="관련 Matter 제거"
                aria-label="관련 Matter 제거"
                onClick={() => onRemove(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {relatedMatters.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            등록된 관련 Matter가 없습니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}
