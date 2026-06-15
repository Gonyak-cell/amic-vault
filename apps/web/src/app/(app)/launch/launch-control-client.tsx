'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  FileCheck2,
  LockKeyhole,
  Rocket,
  ShieldAlert,
  Siren,
} from 'lucide-react';
import { useI18n, type Language } from '@/lib/i18n';

type GateStatus = 'prepared' | 'blocked' | 'green';
type LaunchTab = 'control' | 'staging' | 'uat' | 'production';

const tabs: Array<{ id: LaunchTab }> = [
  { id: 'control' },
  { id: 'staging' },
  { id: 'uat' },
  { id: 'production' },
];

const commandRows = [
  'pnpm launch:readiness',
  'pnpm launch:execution',
  'pnpm release:smoke -- --dry-run',
  'pnpm release:smoke -- --local',
  'pnpm docs:frozen',
];

const launchCopy: Record<
  Language,
  {
    tabs: Record<LaunchTab, string>;
    breadcrumb: [string, string, string];
    title: string;
    pills: [string, string];
    versionLabel: string;
    readOnly: string;
    overviewTitle: string;
    overviewMeta: string;
    metrics: Array<[string, string, string]>;
    table: [string, string, string, string];
    gateRows: Array<[string, GateStatus, string, string]>;
    invariantTitle: string;
    invariantMeta: string;
    invariants: Array<[string, string]>;
    commandTitle: string;
    commandMeta: string;
    stopTitle: string;
    stopMeta: string;
    stopConditions: string[];
    itemTable: [string, string, string];
    stageInputs: Array<[string, string, GateStatus]>;
    uatRows: Array<[string, string, GateStatus]>;
    productionRows: Array<[string, string, GateStatus]>;
    status: Record<GateStatus, string>;
  }
> = {
  ko: {
    tabs: {
      control: '관리 현황',
      staging: '스테이징',
      uat: 'UAT',
      production: '프로덕션',
    },
    breadcrumb: ['운영', '배포 관리', '읽기 전용'],
    title: '운영 관리',
    pills: ['시스템 점검 완료', '승인 필요'],
    versionLabel: '현재 버전',
    readOnly: '이 화면에서는 배포를 실행하지 않습니다.',
    overviewTitle: '배포 상태 요약',
    overviewMeta: '운영자용 읽기 전용 화면',
    metrics: [
      ['시스템 점검', '완료', 'R14 기준 충족'],
      ['승인 항목', '14', '증빙 필요'],
      ['화면에서 배포', '없음', '절차 안내만 제공'],
    ],
    table: ['항목', '상태', '증빙', '메모'],
    gateRows: [
      ['R14 시스템 점검', 'green', 'docs/ledger/gates/R14_gate.md', '시스템 상태 점검 완료'],
      ['출시 준비 점검', 'green', 'pnpm launch:readiness', '필수 문서와 증빙이 서로 맞습니다.'],
      ['출시 실행 점검', 'green', 'pnpm launch:execution', '실행 계획과 증빙이 준비되어 있습니다.'],
      ['로컬 스모크 테스트', 'green', 'pnpm release:smoke -- --local', '합성 데이터 기준 스모크 테스트 완료'],
      ['스테이징 오픈 승인', 'blocked', 'LRB-001/002/003/004/008', '승인 증빙이 필요합니다.'],
      ['프로덕션 배포 승인', 'blocked', 'LRB-009/010/011/012/013', '회사/운영자 승인이 필요합니다.'],
    ],
    invariantTitle: '운영 원칙',
    invariantMeta: '배포 경계',
    invariants: [
      ['화면에서 직접 배포 없음', '배포는 승인된 운영 절차에서만 진행합니다.'],
      ['시크릿 저장 금지', '저장소에는 증빙 ID만 남깁니다.'],
      ['실데이터 보호', '합성 데이터 또는 승인된 파일만 사용합니다.'],
      ['외부 AI 제한', '외부 AI 연결은 닫힌 상태를 유지합니다.'],
    ],
    commandTitle: '검증 명령',
    commandMeta: '운영자/개발자용',
    stopTitle: '중단 조건',
    stopMeta: '안전 차단',
    stopConditions: [
      '시크릿, 비공개 엔드포인트, 고객 데이터가 저장소에 저장되어야 하는 경우',
      '권한, 테넌트 격리, 감사, DLP, 보존, 외부 공유, AI 보호 조건 중 하나라도 실패한 경우',
      '버전이나 배포 대상이 증빙 없이 바뀐 경우',
    ],
    itemTable: ['항목', '증빙', '상태'],
    stageInputs: [
      ['클라우드/리전', 'LRB-001', 'blocked'],
      ['DNS/TLS', 'LRB-002', 'blocked'],
      ['레지스트리/서명', 'LRB-003', 'blocked'],
      ['시크릿 관리자 ID', 'LRB-004', 'blocked'],
      ['모니터링/장애 대응', 'LRB-008', 'blocked'],
      ['릴리스 후보 고정', 'RC-FREEZE-001', 'blocked'],
    ],
    uatRows: [
      ['UAT-001..004', '인증, Matter, 권한, 파일', 'prepared'],
      ['UAT-005..010', '검색, DLP, 긴급 접근, AI, 그래프', 'prepared'],
      ['UAT-011..018', '계약, 실사, 소송, 외부 공유, 보존, 관리, 시스템 상태, 활동 기록', 'prepared'],
      ['UAT-019..020', '백업 복구와 롤백 리허설', 'blocked'],
    ],
    productionRows: [
      ['파일럿 승인', 'LRB-005/006/007/014', 'blocked'],
      ['보안 검토', 'LRB-009', 'blocked'],
      ['고위험 항목 검토', 'LRB-010', 'blocked'],
      ['스테이징 UAT 승인', 'LRB-011', 'blocked'],
      ['백업/복구 승인', 'LRB-012', 'blocked'],
      ['프로덕션 배포 승인', 'LRB-013', 'blocked'],
    ],
    status: {
      green: '완료',
      prepared: '준비됨',
      blocked: '승인 필요',
    },
  },
  en: {
    tabs: {
      control: 'Overview',
      staging: 'Staging',
      uat: 'UAT',
      production: 'Production',
    },
    breadcrumb: ['Operations', 'Release management', 'Read-only'],
    title: 'Operations',
    pills: ['Technical checks complete', 'Approval needed'],
    versionLabel: 'Current version',
    readOnly: 'Deployments are not started from this screen.',
    overviewTitle: 'Release status summary',
    overviewMeta: 'Read-only operator view',
    metrics: [
      ['Technical checks', 'Complete', 'R14 criteria met'],
      ['Approval items', '14', 'Evidence refs required'],
      ['Deploy from screen', 'None', 'Guidance only'],
    ],
    table: ['Item', 'Status', 'Evidence', 'Note'],
    gateRows: [
      ['R14 technical check', 'green', 'docs/ledger/gates/R14_gate.md', 'Scale & Learning technical pass'],
      ['Launch readiness', 'green', 'pnpm launch:readiness', 'Required artifacts are consistent.'],
      ['Launch execution', 'green', 'pnpm launch:execution', 'Execution plan and evidence refs are present.'],
      ['Local smoke test', 'green', 'pnpm release:smoke -- --local', 'Synthetic-data smoke completed.'],
      ['Staging approval', 'blocked', 'LRB-001/002/003/004/008', 'Approval evidence refs are required.'],
      ['Production approval', 'blocked', 'LRB-009/010/011/012/013', 'Company/operator approval is required.'],
    ],
    invariantTitle: 'Operating rules',
    invariantMeta: 'Release boundary',
    invariants: [
      ['No deploy action here', 'Deployments run only through the approved operations flow.'],
      ['No secrets in repo', 'Only reference names belong in the repository.'],
      ['Protect real data', 'Use synthetic data or explicitly approved files only.'],
      ['External AI restricted', 'External model routes remain closed.'],
    ],
    commandTitle: 'Verification commands',
    commandMeta: 'For operators and developers',
    stopTitle: 'Stop conditions',
    stopMeta: 'fail closed',
    stopConditions: [
      'A secret, private endpoint, or customer data would need to be stored in the repo.',
      'Permission, tenant isolation, audit, DLP, retention, external sharing, or AI protection fails.',
      'The version or deployment target changes without an evidence ref.',
    ],
    itemTable: ['Item', 'Evidence', 'Status'],
    stageInputs: [
      ['Cloud/region', 'LRB-001', 'blocked'],
      ['DNS/TLS', 'LRB-002', 'blocked'],
      ['Registry/signing', 'LRB-003', 'blocked'],
      ['Secret manager refs', 'LRB-004', 'blocked'],
      ['Monitoring/incident response', 'LRB-008', 'blocked'],
      ['Release candidate freeze', 'RC-FREEZE-001', 'blocked'],
    ],
    uatRows: [
      ['UAT-001..004', 'Auth, matter, permissions, files', 'prepared'],
      ['UAT-005..010', 'Search, DLP, break-glass, AI, graph', 'prepared'],
      ['UAT-011..018', 'Contracts, diligence, litigation, sharing, retention, admin, health, activity', 'prepared'],
      ['UAT-019..020', 'Backup restore and rollback rehearsal', 'blocked'],
    ],
    productionRows: [
      ['Pilot approval', 'LRB-005/006/007/014', 'blocked'],
      ['Security review', 'LRB-009', 'blocked'],
      ['High-risk disposition', 'LRB-010', 'blocked'],
      ['Staging UAT acceptance', 'LRB-011', 'blocked'],
      ['Backup/restore acceptance', 'LRB-012', 'blocked'],
      ['Production release approval', 'LRB-013', 'blocked'],
    ],
    status: {
      green: 'Complete',
      prepared: 'Prepared',
      blocked: 'Approval needed',
    },
  },
};

export function LaunchControlClient() {
  const { language } = useI18n();
  const copy = launchCopy[language];
  const [activeTab, setActiveTab] = useState<LaunchTab>('control');

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{copy.breadcrumb[0]}</span>
            <span>/</span>
            <span>{copy.breadcrumb[1]}</span>
            <span>/</span>
            <strong className="text-foreground">{copy.breadcrumb[2]}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal">{copy.title}</h1>
            <StatusPill status="green">{copy.pills[0]}</StatusPill>
            <StatusPill status="blocked">{copy.pills[1]}</StatusPill>
          </div>
        </div>
        <div className="grid gap-2 text-right text-sm">
          <span className="font-mono text-xs text-muted-foreground">{copy.versionLabel} a0c1e60</span>
          <span className="font-semibold">{copy.readOnly}</span>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-md border bg-card">
          <PanelHeader icon={<Rocket className="h-4 w-4" />} title={copy.overviewTitle} meta={copy.overviewMeta} />
          <div className="grid gap-0 border-t md:grid-cols-3">
            {copy.metrics.map(([label, value, detail]) => (
              <Metric key={label} label={label} value={value} detail={detail} />
            ))}
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">{copy.table[0]}</th>
                  <th className="px-5 py-3 font-semibold">{copy.table[1]}</th>
                  <th className="px-5 py-3 font-semibold">{copy.table[2]}</th>
                  <th className="px-5 py-3 font-semibold">{copy.table[3]}</th>
                </tr>
              </thead>
              <tbody>
                {copy.gateRows.map(([control, status, evidence, note]) => (
                  <tr key={control} className="border-t">
                    <td className="px-5 py-3 font-semibold">{control}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={status}>{copy.status[status]}</StatusPill>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{evidence}</td>
                    <td className="px-5 py-3 text-muted-foreground">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-md border bg-card">
          <PanelHeader icon={<LockKeyhole className="h-4 w-4" />} title={copy.invariantTitle} meta={copy.invariantMeta} />
          <div className="space-y-4 border-t p-5 text-sm">
            {copy.invariants.map(([label, detail]) => (
              <Invariant key={label} label={label} detail={detail} />
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-md border bg-card">
        <div className="flex flex-wrap items-center gap-6 border-b px-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-12 border-b-2 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {copy.tabs[tab.id]}
            </button>
          ))}
        </div>
        <div className="p-5">{activeTab === 'control' ? <ControlPanel copy={copy} /> : null}</div>
        {activeTab === 'staging' ? <TablePanel rows={copy.stageInputs} icon={<Cloud className="h-4 w-4" />} copy={copy} /> : null}
        {activeTab === 'uat' ? <TablePanel rows={copy.uatRows} icon={<ClipboardCheck className="h-4 w-4" />} copy={copy} /> : null}
        {activeTab === 'production' ? <TablePanel rows={copy.productionRows} icon={<Siren className="h-4 w-4" />} copy={copy} /> : null}
      </section>
    </main>
  );
}

function ControlPanel({ copy }: { copy: (typeof launchCopy)[Language] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-md border">
        <PanelHeader icon={<FileCheck2 className="h-4 w-4" />} title={copy.commandTitle} meta={copy.commandMeta} />
        <div className="divide-y border-t">
          {commandRows.map((command) => (
            <div key={command} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <code className="break-all font-mono text-xs">{command}</code>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border">
        <PanelHeader icon={<ShieldAlert className="h-4 w-4" />} title={copy.stopTitle} meta={copy.stopMeta} />
        <div className="space-y-3 border-t p-5 text-sm text-muted-foreground">
          {copy.stopConditions.map((condition) => (
            <p key={condition}>{condition}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function TablePanel({
  rows,
  icon,
  copy,
}: {
  rows: Array<[string, string, GateStatus]>;
  icon: React.ReactNode;
  copy: (typeof launchCopy)[Language];
}) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
          <tr>
            <th className="px-5 py-3 font-semibold">{copy.itemTable[0]}</th>
            <th className="px-5 py-3 font-semibold">{copy.itemTable[1]}</th>
            <th className="px-5 py-3 font-semibold">{copy.itemTable[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, evidence, status]) => (
            <tr key={item} className="border-t">
              <td className="px-5 py-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="text-primary">{icon}</span>
                  {item}
                </span>
              </td>
              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{evidence}</td>
              <td className="px-5 py-3">
                <StatusPill status={status}>{copy.status[status]}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function Invariant({ label, detail }: { label: string; detail: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPill({ status, children }: { status: GateStatus; children: React.ReactNode }) {
  const className =
    status === 'green'
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      : status === 'blocked'
        ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}
