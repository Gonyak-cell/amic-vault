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
  { id: 'activity', label: 'Activity' },
  { id: 'documents', label: 'Documents' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'ai', label: 'AI Evidence' },
  { id: 'records', label: 'Records' },
];

const tabSummaries: Record<ActivityTab, string> = {
  activity: 'Live audit stream with reference-only event metadata.',
  documents: 'Document versions, holds, previews, and download events.',
  permissions: 'Matter membership, wall state, and fail-closed decisions.',
  ai: 'Local-only evidence flow with external model routes closed.',
  records: 'Retention, legal hold, archive, and disposal controls.',
};

const vaultEvents = [
  {
    id: 'evt-001',
    time: '09:42:18',
    label: 'DOCUMENT_VIEWED',
    actor: 'matter-owner',
    target: 'doc_8f31 / version_03',
    status: 'allowed',
    tone: 'allow',
    metadata: [
      ['tenant_id', 'tenant_alpha'],
      ['matter_id', 'm_2026_0147'],
      ['document_id', 'doc_8f31'],
      ['version_id', 'ver_03'],
      ['channel', 'preview'],
      ['body_logged', 'false'],
    ],
  },
  {
    id: 'evt-002',
    time: '09:41:55',
    label: 'SEARCH_EXECUTED',
    actor: 'limited-reviewer',
    target: 'permission-scoped index',
    status: 'permission filter applied',
    tone: 'allow',
    metadata: [
      ['query_hash', 'sha256:4ac9...'],
      ['scope', 'matter_membership + wall'],
      ['post_filtering', 'false'],
      ['result_count', '12'],
      ['snippet_leakage', '0'],
    ],
  },
  {
    id: 'evt-003',
    time: '09:40:31',
    label: 'AI_POLICY_BLOCKED',
    actor: 'knowledge-manager',
    target: 'external_model route',
    status: 'blocked',
    tone: 'blocked',
    metadata: [
      ['candidate_route', 'external_model'],
      ['external_model_allowed', 'false'],
      ['evidence_pack_ref', 'ai_gate_2026_06_12'],
      ['reason_code', 'AI_POLICY_BLOCKED'],
    ],
  },
  {
    id: 'evt-004',
    time: '09:39:04',
    label: 'LEGAL_HOLD_CHANGED',
    actor: 'records-admin',
    target: 'matter m_2026_0147',
    status: 'active',
    tone: 'watch',
    metadata: [
      ['hold_id', 'hold_204'],
      ['scope', 'matter'],
      ['disposal_blocked', 'true'],
      ['certificate_required', 'true'],
    ],
  },
  {
    id: 'evt-005',
    time: '09:37:44',
    label: 'ACCESS_DENIED',
    actor: 'external-user',
    target: 'restricted data room',
    status: 'denied',
    tone: 'blocked',
    metadata: [
      ['error_code', 'PERMISSION_DENIED'],
      ['safe_message', 'true'],
      ['target_visible', 'false'],
      ['wall_state', 'excluded'],
    ],
  },
] satisfies [VaultEvent, ...VaultEvent[]];

const controlRows: Array<[string, string, string]> = [
  ['Permission-before-search', 'green', 'Query scope injected before FTS execution'],
  ['Permission-before-AI', 'green', 'Only authorized evidence refs can enter AI workflow'],
  ['Audit-by-default', 'green', 'Event write is part of the action transaction'],
  ['Sensitive logging', 'green', 'Reference IDs and hashes only'],
];

const diagnosticsRows: Array<[string, string, string]> = [
  ['Tenant RLS', 'FORCE RLS enabled', '0 destructive runtime grants'],
  ['Search leakage', 'metadata leakage 0', 'snippet/title hidden on deny'],
  ['Records hold', 'hard delete controlled', 'active hold blocks disposal'],
  ['External portal', 'token hash only', 'raw token not stored'],
];

export function VaultActivityClient() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('activity');
  const [selectedEventId, setSelectedEventId] = useState(vaultEvents[0]?.id ?? '');
  const selectedEvent = useMemo<VaultEvent>(
    () => vaultEvents.find((event) => event.id === selectedEventId) ?? vaultEvents[0],
    [selectedEventId],
  );

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>default</span>
            <ChevronRight className="h-4 w-4" />
            <span>Matter Vault</span>
            <ChevronRight className="h-4 w-4" />
            <strong className="text-foreground">M-2026-0147</strong>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal">Cobalt M&amp;A Data Room</h1>
            <StatusPill tone="allow">Gate green</StatusPill>
            <StatusPill tone="watch">Legal hold</StatusPill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" title="Search scoped matter activity">
            <Search className="h-4 w-4" />
            Scope
          </Button>
          <Button variant="outline" size="sm" title="Export reference-only evidence">
            <Archive className="h-4 w-4" />
            Evidence
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
                {tab.label}
              </button>
            ))}
          </div>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<Activity className="h-4 w-4" />}
                title="Event Stream"
                meta={tabSummaries[activeTab]}
              />
              <div className="border-t">
                {vaultEvents.map((event) => (
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
                meta={selectedEvent.actor}
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
                title="Data Quality"
                meta="in progress"
              />
              <div className="space-y-4 border-t p-5">
                {controlRows.map(([label, status, detail]) => (
                  <QualityRow key={label} label={label} status={status} detail={detail} />
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <PanelHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Summary"
                meta="technical launch prepared"
              />
              <div className="grid gap-0 border-t md:grid-cols-4">
                <Metric label="Documents" value="1,284" detail="current versions" />
                <Metric label="Denied" value="7" detail="safe responses" />
                <Metric label="Audit" value="100%" detail="required events" />
                <Metric label="External AI" value="0" detail="open routes" />
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-card">
            <PanelHeader icon={<Clock3 className="h-4 w-4" />} title="Diagnostics" meta="last 30 days" />
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Control</th>
                    <th className="px-5 py-3 font-semibold">State</th>
                    <th className="px-5 py-3 font-semibold">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticsRows.map(([control, state, evidence]) => (
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
  return (
    <aside className="rounded-md border bg-card p-6">
      <div className="flex flex-col items-center border-b pb-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-secondary text-2xl font-semibold text-primary">
          C
        </div>
        <h2 className="mt-4 text-xl font-semibold">Cobalt Energy Holdings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Anonymous client profile</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b py-5">
        <ProfileStat label="First seen" value="Jun 11, 2026" />
        <ProfileStat label="Last event" value="09:42 KST" />
      </div>

      <div className="py-5">
        <div className="mb-3 flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          Search properties
        </div>
        <div className="space-y-4">
          <PropertyRow label="Matter ID" value="M-2026-0147" />
          <PropertyRow label="Client" value="Cobalt Energy Holdings" />
          <PropertyRow label="Confidentiality" value="restricted" />
          <PropertyRow label="Ethical wall" value="active" />
          <PropertyRow label="AI policy" value="local evidence only" />
          <PropertyRow label="Records" value="legal hold active" />
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
