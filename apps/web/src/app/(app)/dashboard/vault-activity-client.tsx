'use client';

import React, { useState } from 'react';
import {
  Activity,
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSearch,
  LockKeyhole,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n, type Language } from '@/lib/i18n';

type ActivityTab = 'activity' | 'documents' | 'permissions' | 'ai' | 'records';
type EventTone = 'allow' | 'watch' | 'blocked';
type StatusTone = EventTone | 'neutral';

type VaultEvent = {
  id: string;
  time: string;
  label: string;
  actor: string;
  target: string;
  status: string;
  tone: EventTone;
  metadata: Array<[string, string]>;
};

const tabs: Array<{ id: ActivityTab; label: string }> = [
  { id: 'activity', label: 'activity' },
  { id: 'documents', label: 'documents' },
  { id: 'permissions', label: 'permissions' },
  { id: 'ai', label: 'ai' },
  { id: 'records', label: 'records' },
];

const dashboardCopy: Record<
  Language,
  {
    breadcrumb: [string, string, string];
    title: string;
    pills: [string, string];
    actions: [string, string];
    tabs: Record<ActivityTab, string>;
    tabSummaries: Record<ActivityTab, string>;
    events: VaultEvent[];
    profile: {
      title: string;
      description: string;
      search: string;
      properties: Array<[string, string]>;
    };
    sections: {
      activity: string;
      selectedActivity: string;
      securityStatus: string;
      securityMeta: string;
      summary: string;
      summaryMeta: string;
      diagnostics: string;
      diagnosticsMeta: string;
      table: [string, string, string];
    };
    emptyStates: Record<'activity' | 'selectedActivity' | 'security' | 'summary' | 'diagnostics' | 'profile', {
      title: string;
      body: string;
    }>;
    controlRows: Array<[string, string, string]>;
    metrics: Array<[string, string, string]>;
    diagnosticsRows: Array<[string, string, string]>;
  }
> = {
  ko: {
    breadcrumb: ['홈', 'Matter', '선택 없음'],
    title: 'Matter 대시보드',
    pills: ['데이터 미연결', '실데이터만 표시'],
    actions: ['활동 검색', '기록 내보내기'],
    tabs: {
      activity: '최근 활동',
      documents: '파일',
      permissions: '접근 권한',
      ai: 'AI 검토 근거',
      records: '보존 관리',
    },
    tabSummaries: {
      activity: '실제 감사 이벤트가 연결되면 최근 활동이 표시됩니다.',
      documents: '실제 파일 버전과 보존 상태가 연결되면 표시됩니다.',
      permissions: '실제 멤버 접근 권한과 정보 장벽 상태가 표시됩니다.',
      ai: '실제 AI 근거 검토가 승인된 경우에만 출처가 표시됩니다.',
      records: '실제 보존 기간과 삭제 금지 상태가 표시됩니다.',
    },
    events: [],
    profile: {
      title: 'Matter 선택 필요',
      description: '실제 Matter를 선택하면 고객, 권한, 보존 상태가 표시됩니다.',
      search: '속성 검색',
      properties: [],
    },
    sections: {
      activity: '활동 기록',
      selectedActivity: '선택한 활동',
      securityStatus: '보안 상태',
      securityMeta: '데이터 없음',
      summary: '요약',
      summaryMeta: '데이터 없음',
      diagnostics: '보호 상태',
      diagnosticsMeta: '데이터 없음',
      table: ['항목', '상태', '설명'],
    },
    emptyStates: {
      activity: {
        title: '실제 Matter 데이터가 없습니다.',
        body: '활동 기록은 API에서 수신한 감사 이벤트만 표시합니다.',
      },
      selectedActivity: {
        title: '선택된 활동이 없습니다.',
        body: '활동 기록이 연결되면 세부 메타데이터가 이 영역에 표시됩니다.',
      },
      security: {
        title: '보안 상태 데이터가 없습니다.',
        body: '권한 평가와 정보 장벽 상태가 실제 응답으로 연결된 뒤 표시됩니다.',
      },
      summary: {
        title: '요약 수치가 없습니다.',
        body: '파일 수, 제한 건수, 감사 완료율 같은 수치는 실데이터만 표시합니다.',
      },
      diagnostics: {
        title: '진단 결과가 없습니다.',
        body: '보호 상태 점검 결과가 연결되기 전에는 상태를 표시하지 않습니다.',
      },
      profile: {
        title: '표시할 Matter 속성이 없습니다.',
        body: '고객명, Matter 번호, 보안 등급은 실제 선택 항목에서만 표시됩니다.',
      },
    },
    controlRows: [],
    metrics: [],
    diagnosticsRows: [],
  },
  en: {
    breadcrumb: ['Home', 'Matter', 'None selected'],
    title: 'Matter dashboard',
    pills: ['Data not connected', 'Live data only'],
    actions: ['Search activity', 'Export log'],
    tabs: {
      activity: 'Recent activity',
      documents: 'Files',
      permissions: 'Access',
      ai: 'AI evidence',
      records: 'Retention',
    },
    tabSummaries: {
      activity: 'Recent activity appears after live audit events are connected.',
      documents: 'Live file versions and retention status appear after connection.',
      permissions: 'Live member access and information barrier status appear here.',
      ai: 'AI evidence appears only when a real governed review is available.',
      records: 'Live retention periods and holds appear after connection.',
    },
    events: [],
    profile: {
      title: 'Select a matter',
      description: 'Client, access, and retention state appear after a live matter is selected.',
      search: 'Search properties',
      properties: [],
    },
    sections: {
      activity: 'Activity log',
      selectedActivity: 'Selected activity',
      securityStatus: 'Security status',
      securityMeta: 'No data',
      summary: 'Summary',
      summaryMeta: 'No data',
      diagnostics: 'Protection status',
      diagnosticsMeta: 'No data',
      table: ['Item', 'Status', 'Details'],
    },
    emptyStates: {
      activity: {
        title: 'No live matter data.',
        body: 'The dashboard renders only audit events received from the API.',
      },
      selectedActivity: {
        title: 'No activity selected.',
        body: 'Event metadata appears here after live activity is connected.',
      },
      security: {
        title: 'No security status data.',
        body: 'Permission and barrier state appears after live responses are connected.',
      },
      summary: {
        title: 'No summary metrics.',
        body: 'File counts, restriction counts, and audit coverage are shown only from live data.',
      },
      diagnostics: {
        title: 'No diagnostic results.',
        body: 'The UI no longer invents healthy status before real checks are available.',
      },
      profile: {
        title: 'No matter properties to display.',
        body: 'Client, matter number, and security level appear only from the selected live matter.',
      },
    },
    controlRows: [],
    metrics: [],
    diagnosticsRows: [],
  },
};

export function VaultActivityClient() {
  const { language } = useI18n();
  const copy = dashboardCopy[language];
  const [activeTab, setActiveTab] = useState<ActivityTab>('activity');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = copy.events.find((event) => event.id === selectedEventId);

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{copy.breadcrumb[0]}</span>
            <ChevronRight className="h-4 w-4" />
            <span>{copy.breadcrumb[1]}</span>
            <ChevronRight className="h-4 w-4" />
            <strong className="text-foreground">{copy.breadcrumb[2]}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal">{copy.title}</h1>
            <StatusPill tone="neutral">{copy.pills[0]}</StatusPill>
            <StatusPill tone="neutral">{copy.pills[1]}</StatusPill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" title={copy.actions[0]}>
            <Search className="h-4 w-4" />
            {copy.actions[0]}
          </Button>
          <Button variant="outline" size="sm" title={copy.actions[1]}>
            <Archive className="h-4 w-4" />
            {copy.actions[1]}
          </Button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <MatterProfile />

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-7 border-b">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-11 border-b-2 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {copy.tabs[tab.id]}
              </button>
            ))}
          </div>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<Activity className="h-4 w-4" />}
                title={copy.sections.activity}
                meta={copy.tabSummaries[activeTab]}
              />
              <div className="border-t">
                {copy.events.length === 0 ? (
                  <EmptyState title={copy.emptyStates.activity.title} body={copy.emptyStates.activity.body} />
                ) : (
                  copy.events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={`grid w-full grid-cols-[64px_12px_minmax(0,1fr)] items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 sm:grid-cols-[92px_16px_minmax(0,1fr)_140px] sm:gap-4 sm:px-5 ${
                        selectedEvent?.id === event.id ? 'bg-secondary/70' : 'hover:bg-muted'
                      }`}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${toneDotClass(event.tone)}`} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{event.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{event.target}</span>
                      </span>
                      <span
                        className={`hidden justify-self-end rounded-sm px-2 py-1 text-xs sm:inline-flex ${toneBadgeClass(event.tone)}`}
                      >
                        {event.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <aside className="rounded-md border bg-card">
              <PanelHeader
                icon={<FileSearch className="h-4 w-4" />}
                title={selectedEvent?.label ?? copy.sections.selectedActivity}
                meta={selectedEvent ? `${copy.sections.selectedActivity} · ${selectedEvent.actor}` : copy.emptyStates.selectedActivity.title}
              />
              <div className="border-t p-5">
                {selectedEvent ? (
                  <dl className="grid gap-3 text-sm">
                    {selectedEvent.metadata.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4">
                        <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
                        <dd className="truncate font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <EmptyState
                    title={copy.emptyStates.selectedActivity.title}
                    body={copy.emptyStates.selectedActivity.body}
                    compact
                  />
                )}
              </div>
            </aside>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<ShieldCheck className="h-4 w-4" />}
                title={copy.sections.securityStatus}
                meta={copy.sections.securityMeta}
              />
              <div className="space-y-4 border-t p-5">
                {copy.controlRows.length === 0 ? (
                  <EmptyState title={copy.emptyStates.security.title} body={copy.emptyStates.security.body} compact />
                ) : (
                  copy.controlRows.map(([label, status, detail]) => (
                    <QualityRow key={label} label={label} status={status} detail={detail} />
                  ))
                )}
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title={copy.sections.summary}
                meta={copy.sections.summaryMeta}
              />
              <div className="grid gap-0 border-t md:grid-cols-4">
                {copy.metrics.length === 0 ? (
                  <div className="md:col-span-4">
                    <EmptyState title={copy.emptyStates.summary.title} body={copy.emptyStates.summary.body} />
                  </div>
                ) : (
                  copy.metrics.map(([label, value, detail]) => (
                    <Metric key={label} label={label} value={value} detail={detail} />
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-card">
            <PanelHeader icon={<Clock3 className="h-4 w-4" />} title={copy.sections.diagnostics} meta={copy.sections.diagnosticsMeta} />
            {copy.diagnosticsRows.length === 0 ? (
              <div className="border-t">
                <EmptyState title={copy.emptyStates.diagnostics.title} body={copy.emptyStates.diagnostics.body} />
              </div>
            ) : (
              <div className="overflow-x-auto border-t">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">{copy.sections.table[0]}</th>
                      <th className="px-5 py-3 font-semibold">{copy.sections.table[1]}</th>
                      <th className="px-5 py-3 font-semibold">{copy.sections.table[2]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copy.diagnosticsRows.map(([control, state, evidence]) => (
                      <tr key={control} className="border-t">
                        <td className="px-5 py-3 font-semibold">{control}</td>
                        <td className="px-5 py-3 text-muted-foreground">{state}</td>
                        <td className="px-5 py-3 text-muted-foreground">{evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function MatterProfile() {
  const { language } = useI18n();
  const copy = dashboardCopy[language].profile;

  return (
    <aside className="rounded-md border bg-card p-6">
      <div className="flex flex-col items-center border-b pb-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-secondary text-2xl font-semibold text-primary">
          -
        </div>
        <h2 className="mt-4 text-xl font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <div className="py-5">
        <div className="mb-3 flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          {copy.search}
        </div>
        <div className="space-y-4">
          {copy.properties.length === 0 ? (
            <EmptyState title={dashboardCopy[language].emptyStates.profile.title} body={dashboardCopy[language].emptyStates.profile.body} compact />
          ) : (
            copy.properties.map(([label, value]) => (
              <PropertyRow key={label} label={label} value={value} />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function PanelHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-primary">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
      <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function QualityRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="rounded-sm bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
          {status}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <div className="mt-2 h-1.5 rounded-full bg-emerald-100">
        <div className="h-1.5 w-full rounded-full bg-emerald-300" />
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-b px-5 py-5 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'min-h-28 p-3' : 'min-h-44 p-6'}`}>
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
        <LockKeyhole className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${toneBadgeClass(tone)}`}>{children}</span>;
}

function toneDotClass(tone: EventTone): string {
  if (tone === 'blocked') return 'bg-red-500';
  if (tone === 'watch') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function toneBadgeClass(tone: StatusTone): string {
  if (tone === 'blocked') return 'bg-red-50 text-red-700 ring-1 ring-red-200';
  if (tone === 'watch') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  if (tone === 'neutral') return 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
}
