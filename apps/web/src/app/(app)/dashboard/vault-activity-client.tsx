'use client';

import React, { useMemo, useState } from 'react';
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
    events: [VaultEvent, ...VaultEvent[]];
    profile: {
      client: string;
      description: string;
      firstSeen: string;
      lastEvent: string;
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
    controlRows: Array<[string, string, string]>;
    metrics: Array<[string, string, string]>;
    diagnosticsRows: Array<[string, string, string]>;
  }
> = {
  ko: {
    breadcrumb: ['홈', 'Matter', 'M-2026-0147'],
    title: '계약 자료실',
    pills: ['접근 가능', '삭제 금지 적용'],
    actions: ['활동 검색', '기록 내보내기'],
    tabs: {
      activity: '최근 활동',
      documents: '파일',
      permissions: '접근 권한',
      ai: 'AI 검토 근거',
      records: '보존 관리',
    },
    tabSummaries: {
      activity: '최근 파일 열람, 검색, 권한 변경 내역입니다.',
      documents: '파일 버전, 미리보기, 다운로드, 삭제 금지 상태입니다.',
      permissions: '멤버 접근 권한과 정보 장벽 상태입니다.',
      ai: 'AI 요약에 사용된 파일 출처와 제한 상태입니다.',
      records: '보존 기간, 삭제 금지, 폐기 검토 상태입니다.',
    },
    events: [
      {
        id: 'evt-001',
        time: '09:42',
        label: '파일 열람',
        actor: 'Matter 담당자',
        target: '주식매매계약서 v3 미리보기',
        status: '접근 가능',
        tone: 'allow',
        metadata: [
          ['워크스페이스', 'Alpha'],
          ['Matter', 'M-2026-0147'],
          ['파일', '주식매매계약서 v3'],
          ['버전', '3'],
          ['열람 방식', '미리보기'],
          ['본문 기록', '기록 안 함'],
        ],
      },
      {
        id: 'evt-002',
        time: '09:41',
        label: '검색 실행',
        actor: '제한된 검토자',
        target: '접근 권한이 있는 파일만 검색됨',
        status: '권한 적용됨',
        tone: 'allow',
        metadata: [
          ['검색어', '해시로 저장'],
          ['범위', 'Matter 멤버와 정보 장벽 기준'],
          ['사후 필터링', '사용 안 함'],
          ['결과', '12개'],
          ['숨겨진 결과 노출', '0건'],
        ],
      },
      {
        id: 'evt-003',
        time: '09:40',
        label: '외부 AI 사용 제한',
        actor: '지식 관리자',
        target: '외부 모델 연결',
        status: '제한됨',
        tone: 'blocked',
        metadata: [
          ['요청 경로', '외부 모델'],
          ['외부 AI', '허용 안 됨'],
          ['근거 자료', 'AI 검토 기준'],
          ['사유', 'AI 정책에 따라 제한'],
        ],
      },
      {
        id: 'evt-004',
        time: '09:39',
        label: '삭제 금지 적용',
        actor: '기록 관리자',
        target: 'M-2026-0147 Matter',
        status: '확인 필요',
        tone: 'watch',
        metadata: [
          ['보존 관리', '삭제 금지 204'],
          ['범위', 'Matter'],
          ['폐기', '보류'],
          ['증명서', '필요'],
        ],
      },
      {
        id: 'evt-005',
        time: '09:37',
        label: '접근 제한',
        actor: '외부 검토자',
        target: '제한된 자료실',
        status: '제한됨',
        tone: 'blocked',
        metadata: [
          ['응답', '접근 제한'],
          ['안전한 안내', '사용'],
          ['대상 표시', '숨김'],
          ['정보 장벽', '적용됨'],
        ],
      },
    ],
    profile: {
      client: 'Cobalt Energy Holdings',
      description: '비식별 고객 프로필',
      firstSeen: '처음 등록',
      lastEvent: '최근 활동',
      search: '속성 검색',
      properties: [
        ['Matter 번호', 'M-2026-0147'],
        ['고객', 'Cobalt Energy Holdings'],
        ['보안 등급', '제한됨'],
        ['정보 장벽', '적용 중'],
        ['AI 정책', '승인된 자료만 사용'],
        ['보존 상태', '삭제 금지 적용'],
      ],
    },
    sections: {
      activity: '활동 기록',
      selectedActivity: '선택한 활동',
      securityStatus: '보안 상태',
      securityMeta: '정상',
      summary: '요약',
      summaryMeta: '현재 Matter',
      diagnostics: '보호 상태',
      diagnosticsMeta: '최근 30일',
      table: ['항목', '상태', '설명'],
    },
    controlRows: [
      ['검색 전 접근 권한 확인', '정상', '검색하기 전에 볼 수 있는 파일만 추립니다.'],
      ['AI 사용 전 권한 확인', '정상', '허용된 파일 출처만 AI 요약에 사용됩니다.'],
      ['활동 자동 기록', '정상', '파일 열람과 권한 변경은 활동 기록에 남습니다.'],
      ['민감정보 보호', '정상', '본문 대신 ID와 해시만 기록합니다.'],
    ],
    metrics: [
      ['파일', '1,284', '현재 버전'],
      ['접근 제한', '7', '안전하게 안내됨'],
      ['활동 기록', '100%', '필수 기록 완료'],
      ['외부 AI', '0', '열린 경로 없음'],
    ],
    diagnosticsRows: [
      ['워크스페이스 격리', '적용 중', '다른 워크스페이스 자료는 표시되지 않습니다.'],
      ['검색 보호', '정상', '권한 없는 제목과 본문은 숨겨집니다.'],
      ['보존 관리', '삭제 금지 적용', '검토 전에는 파일이 폐기되지 않습니다.'],
      ['공유 링크', '보호됨', '원본 토큰은 저장하지 않습니다.'],
    ],
  },
  en: {
    breadcrumb: ['Home', 'Matter', 'M-2026-0147'],
    title: 'Contract workspace',
    pills: ['Accessible', 'Hold applied'],
    actions: ['Search activity', 'Export log'],
    tabs: {
      activity: 'Recent activity',
      documents: 'Files',
      permissions: 'Access',
      ai: 'AI evidence',
      records: 'Retention',
    },
    tabSummaries: {
      activity: 'Recent file views, searches, and access changes.',
      documents: 'File versions, previews, downloads, and hold status.',
      permissions: 'Member access and information barrier status.',
      ai: 'File sources and restrictions used for AI summaries.',
      records: 'Retention periods, holds, and disposal review status.',
    },
    events: [
      {
        id: 'evt-001',
        time: '09:42',
        label: 'File viewed',
        actor: 'Matter owner',
        target: 'Share Purchase Agreement v3 preview',
        status: 'Accessible',
        tone: 'allow',
        metadata: [
          ['Workspace', 'Alpha'],
          ['Matter', 'M-2026-0147'],
          ['File', 'Share Purchase Agreement v3'],
          ['Version', '3'],
          ['View type', 'Preview'],
          ['Body stored', 'No'],
        ],
      },
      {
        id: 'evt-002',
        time: '09:41',
        label: 'Search run',
        actor: 'Limited reviewer',
        target: 'Only accessible files were searched',
        status: 'Access applied',
        tone: 'allow',
        metadata: [
          ['Query', 'Stored as hash'],
          ['Scope', 'Matter membership and barriers'],
          ['Post-filtering', 'Not used'],
          ['Results', '12'],
          ['Hidden result exposure', '0'],
        ],
      },
      {
        id: 'evt-003',
        time: '09:40',
        label: 'External AI restricted',
        actor: 'Knowledge manager',
        target: 'External model connection',
        status: 'Restricted',
        tone: 'blocked',
        metadata: [
          ['Requested route', 'External model'],
          ['External AI', 'Not allowed'],
          ['Evidence set', 'AI review policy'],
          ['Reason', 'Restricted by AI policy'],
        ],
      },
      {
        id: 'evt-004',
        time: '09:39',
        label: 'Hold applied',
        actor: 'Records manager',
        target: 'Matter M-2026-0147',
        status: 'Needs review',
        tone: 'watch',
        metadata: [
          ['Retention setting', 'Hold 204'],
          ['Scope', 'Matter'],
          ['Disposal', 'On hold'],
          ['Certificate', 'Required'],
        ],
      },
      {
        id: 'evt-005',
        time: '09:37',
        label: 'Access restricted',
        actor: 'External reviewer',
        target: 'Restricted workspace',
        status: 'Restricted',
        tone: 'blocked',
        metadata: [
          ['Response', 'Access restricted'],
          ['Safe message', 'Used'],
          ['Target visibility', 'Hidden'],
          ['Information barrier', 'Applied'],
        ],
      },
    ],
    profile: {
      client: 'Cobalt Energy Holdings',
      description: 'De-identified client profile',
      firstSeen: 'First added',
      lastEvent: 'Latest activity',
      search: 'Search properties',
      properties: [
        ['Matter number', 'M-2026-0147'],
        ['Client', 'Cobalt Energy Holdings'],
        ['Security level', 'Restricted'],
        ['Information barrier', 'Applied'],
        ['AI policy', 'Approved sources only'],
        ['Retention status', 'Hold applied'],
      ],
    },
    sections: {
      activity: 'Activity log',
      selectedActivity: 'Selected activity',
      securityStatus: 'Security status',
      securityMeta: 'Healthy',
      summary: 'Summary',
      summaryMeta: 'Current matter',
      diagnostics: 'Protection status',
      diagnosticsMeta: 'Last 30 days',
      table: ['Item', 'Status', 'Details'],
    },
    controlRows: [
      ['Access checked before search', 'Healthy', 'Search only includes files the user can view.'],
      ['Access checked before AI', 'Healthy', 'Only allowed file sources can be used in AI summaries.'],
      ['Activity recorded automatically', 'Healthy', 'File views and access changes are logged.'],
      ['Sensitive information protected', 'Healthy', 'References and hashes are logged instead of body text.'],
    ],
    metrics: [
      ['Files', '1,284', 'Current versions'],
      ['Restricted', '7', 'Safe responses'],
      ['Activity log', '100%', 'Required events'],
      ['External AI', '0', 'Open routes'],
    ],
    diagnosticsRows: [
      ['Workspace isolation', 'Applied', 'Other workspaces are not shown.'],
      ['Search protection', 'Healthy', 'Unauthorized titles and snippets stay hidden.'],
      ['Retention settings', 'Hold applied', 'Files are not disposed before review.'],
      ['Shared links', 'Protected', 'Raw tokens are not stored.'],
    ],
  },
};

export function VaultActivityClient() {
  const { language } = useI18n();
  const copy = dashboardCopy[language];
  const [activeTab, setActiveTab] = useState<ActivityTab>('activity');
  const [selectedEventId, setSelectedEventId] = useState(copy.events[0].id);
  const selectedEvent = useMemo<VaultEvent>(
    () => copy.events.find((event) => event.id === selectedEventId) ?? copy.events[0],
    [copy.events, selectedEventId],
  );

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
            <StatusPill tone="allow">{copy.pills[0]}</StatusPill>
            <StatusPill tone="watch">{copy.pills[1]}</StatusPill>
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
                {copy.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={`grid w-full grid-cols-[64px_12px_minmax(0,1fr)] items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 sm:grid-cols-[92px_16px_minmax(0,1fr)_140px] sm:gap-4 sm:px-5 ${
                      selectedEvent.id === event.id ? 'bg-secondary/70' : 'hover:bg-muted'
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
                ))}
              </div>
            </div>

            <aside className="rounded-md border bg-card">
              <PanelHeader
                icon={<FileSearch className="h-4 w-4" />}
                title={selectedEvent.label}
                meta={`${copy.sections.selectedActivity} · ${selectedEvent.actor}`}
              />
              <div className="border-t p-5">
                <dl className="grid gap-3 text-sm">
                  {selectedEvent.metadata.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4">
                      <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
                      <dd className="truncate font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
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
                {copy.controlRows.map(([label, status, detail]) => (
                  <QualityRow key={label} label={label} status={status} detail={detail} />
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title={copy.sections.summary}
                meta={copy.sections.summaryMeta}
              />
              <div className="grid gap-0 border-t md:grid-cols-4">
                {copy.metrics.map(([label, value, detail]) => (
                  <Metric key={label} label={label} value={value} detail={detail} />
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-card">
            <PanelHeader icon={<Clock3 className="h-4 w-4" />} title={copy.sections.diagnostics} meta={copy.sections.diagnosticsMeta} />
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
          C
        </div>
        <h2 className="mt-4 text-xl font-semibold">{copy.client}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b py-5">
        <ProfileStat label={copy.firstSeen} value="2026-06-11" />
        <ProfileStat label={copy.lastEvent} value="09:42 KST" />
      </div>

      <div className="py-5">
        <div className="mb-3 flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          {copy.search}
        </div>
        <div className="space-y-4">
          {copy.properties.map(([label, value]) => (
            <PropertyRow key={label} label={label} value={value} />
          ))}
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

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
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

function StatusPill({ tone, children }: { tone: EventTone; children: React.ReactNode }) {
  return <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${toneBadgeClass(tone)}`}>{children}</span>;
}

function toneDotClass(tone: EventTone): string {
  if (tone === 'blocked') return 'bg-red-500';
  if (tone === 'watch') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function toneBadgeClass(tone: EventTone): string {
  if (tone === 'blocked') return 'bg-red-50 text-red-700 ring-1 ring-red-200';
  if (tone === 'watch') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
}
