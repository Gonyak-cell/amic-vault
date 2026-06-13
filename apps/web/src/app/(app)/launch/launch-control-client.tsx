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

type GateStatus = 'prepared' | 'blocked' | 'green';
type LaunchTab = 'control' | 'staging' | 'uat' | 'production';

const tabs: Array<{ id: LaunchTab; label: string }> = [
  { id: 'control', label: 'Control' },
  { id: 'staging', label: 'Staging' },
  { id: 'uat', label: 'UAT' },
  { id: 'production', label: 'Production' },
];

const gateRows: Array<[string, GateStatus, string, string]> = [
  ['R14 technical gate', 'green', 'docs/ledger/gates/R14_gate.md', 'Scale & Learning technical pass'],
  ['Launch readiness', 'green', 'pnpm launch:readiness', 'Artifacts are internally consistent'],
  ['Launch execution', 'green', 'pnpm launch:execution', 'Execution plan and evidence refs are present'],
  ['Local smoke', 'green', 'pnpm release:smoke -- --local', 'Synthetic local SMOKE-001 through SMOKE-010'],
  ['Staging opening', 'blocked', 'LRB-001/002/003/004/008', 'Approval evidence refs required'],
  ['Production release', 'blocked', 'LRB-009/010/011/012/013', 'Human/company gate required'],
];

const stageInputs: Array<[string, string, string]> = [
  ['Cloud/region', 'LRB-001', 'blocked'],
  ['DNS/TLS', 'LRB-002', 'blocked'],
  ['Registry/signing', 'LRB-003', 'blocked'],
  ['Secret manager refs', 'LRB-004', 'blocked'],
  ['Monitoring/incident', 'LRB-008', 'blocked'],
  ['RC freeze', 'RC-FREEZE-001', 'blocked'],
];

const uatRows: Array<[string, string, string]> = [
  ['UAT-001..004', 'Auth, matter, permission, document', 'prepared'],
  ['UAT-005..010', 'Search, DLP, break glass, AI, graph', 'prepared'],
  ['UAT-011..018', 'Contract, DD, litigation, external, records, enterprise, scale, audit', 'prepared'],
  ['UAT-019..020', 'Backup restore and rollback rehearsal', 'blocked'],
];

const productionRows: Array<[string, string, string]> = [
  ['Pilot gate', 'LRB-005/006/007/014', 'blocked'],
  ['Security review', 'LRB-009', 'blocked'],
  ['Risk C disposition', 'LRB-010', 'blocked'],
  ['Staging UAT acceptance', 'LRB-011', 'blocked'],
  ['Backup/restore acceptance', 'LRB-012', 'blocked'],
  ['Production release approval', 'LRB-013', 'blocked'],
];

const commandRows = [
  'pnpm launch:readiness',
  'pnpm launch:execution',
  'pnpm release:smoke -- --dry-run',
  'pnpm release:smoke -- --local',
  'pnpm docs:frozen',
];

export function LaunchControlClient() {
  const [activeTab, setActiveTab] = useState<LaunchTab>('control');

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>release</span>
            <span>/</span>
            <span>post-r14</span>
            <span>/</span>
            <strong className="text-foreground">launch control</strong>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal">Launch Control</h1>
            <StatusPill status="green">technical green</StatusPill>
            <StatusPill status="blocked">approval blocked</StatusPill>
          </div>
        </div>
        <div className="grid gap-2 text-right text-sm">
          <span className="font-mono text-xs text-muted-foreground">candidate a0c1e60</span>
          <span className="font-semibold">staging and production disabled</span>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-md border bg-card">
          <PanelHeader icon={<Rocket className="h-4 w-4" />} title="Gate Overview" meta="current technical state" />
          <div className="grid gap-0 border-t md:grid-cols-3">
            <Metric label="Technical gates" value="green" detail="R14 complete" />
            <Metric label="Launch blockers" value="14" detail="approval-required" />
            <Metric label="Prod deploy" value="off" detail="gate disabled" />
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Control</th>
                  <th className="px-5 py-3 font-semibold">State</th>
                  <th className="px-5 py-3 font-semibold">Evidence</th>
                  <th className="px-5 py-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {gateRows.map(([control, status, evidence, note]) => (
                  <tr key={control} className="border-t">
                    <td className="px-5 py-3 font-semibold">{control}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={status}>{status}</StatusPill>
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
          <PanelHeader icon={<LockKeyhole className="h-4 w-4" />} title="Invariant Lock" meta="release boundary" />
          <div className="space-y-4 border-t p-5 text-sm">
            <Invariant label="No deployment" detail="Staging/prod require LRB evidence refs." />
            <Invariant label="No secrets" detail="Only ref names belong in the repository." />
            <Invariant label="No real data" detail="Synthetic or explicitly approved pilot data only." />
            <Invariant label="No external AI" detail="External model routes remain closed." />
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
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-5">{activeTab === 'control' ? <ControlPanel /> : null}</div>
        {activeTab === 'staging' ? <TablePanel rows={stageInputs} icon={<Cloud className="h-4 w-4" />} /> : null}
        {activeTab === 'uat' ? <TablePanel rows={uatRows} icon={<ClipboardCheck className="h-4 w-4" />} /> : null}
        {activeTab === 'production' ? <TablePanel rows={productionRows} icon={<Siren className="h-4 w-4" />} /> : null}
      </section>
    </main>
  );
}

function ControlPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-md border">
        <PanelHeader icon={<FileCheck2 className="h-4 w-4" />} title="Local Command Set" meta="Codex executable" />
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
        <PanelHeader icon={<ShieldAlert className="h-4 w-4" />} title="Stop Conditions" meta="fail closed" />
        <div className="space-y-3 border-t p-5 text-sm text-muted-foreground">
          <p>Secret, private endpoint, or customer data would need repository storage.</p>
          <p>Permission, tenant isolation, audit, DLP, records, external, or AI invariant fails.</p>
          <p>Release SHA or deployment target changes without evidence ref.</p>
        </div>
      </div>
    </div>
  );
}

function TablePanel({ rows, icon }: { rows: Array<[string, string, string]>; icon: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-xs uppercase tracking-normal text-muted-foreground">
          <tr>
            <th className="px-5 py-3 font-semibold">Item</th>
            <th className="px-5 py-3 font-semibold">Evidence</th>
            <th className="px-5 py-3 font-semibold">State</th>
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
                <StatusPill status={status === 'blocked' ? 'blocked' : 'prepared'}>{status}</StatusPill>
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
