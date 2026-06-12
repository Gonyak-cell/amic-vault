'use client';

import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  DatabaseBackup,
  FileCheck2,
  KeyRound,
  RadioTower,
} from 'lucide-react';
import type {
  EnterpriseBackupSnapshotListResponseDto,
  EnterpriseComplianceEvidenceListResponseDto,
  EnterpriseKeyReferenceListResponseDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportListResponseDto,
  EnterpriseSsoProviderListResponseDto,
  EnterpriseSsoSpMetadataDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  activateEnterpriseSsoProvider,
  createEnterpriseBackupSnapshot,
  createEnterpriseComplianceEvidence,
  createEnterpriseKeyReference,
  createEnterpriseSiemExport,
  createEnterpriseSsoProvider,
  getEnterpriseReadiness,
  getEnterpriseSsoMetadata,
  listEnterpriseBackupSnapshots,
  listEnterpriseComplianceEvidence,
  listEnterpriseKeyReferences,
  listEnterpriseSiemExports,
  listEnterpriseSsoProviders,
  verifyEnterpriseKeyReference,
} from '@/lib/api/enterprise';

const sampleHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sampleFingerprint = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD';

export function EnterpriseHardeningClient() {
  const [providerKey, setProviderKey] = useState('corp-idp');
  const [providerId, setProviderId] = useState('');
  const [keyReferenceId, setKeyReferenceId] = useState('');
  const [controlId, setControlId] = useState('CC6.1');
  const [evidenceRef, setEvidenceRef] = useState('soc2-access-control');
  const [providers, setProviders] = useState<EnterpriseSsoProviderListResponseDto | null>(null);
  const [metadata, setMetadata] = useState<EnterpriseSsoSpMetadataDto | null>(null);
  const [keys, setKeys] = useState<EnterpriseKeyReferenceListResponseDto | null>(null);
  const [exports, setExports] = useState<EnterpriseSiemExportListResponseDto | null>(null);
  const [snapshots, setSnapshots] = useState<EnterpriseBackupSnapshotListResponseDto | null>(null);
  const [evidence, setEvidence] = useState<EnterpriseComplianceEvidenceListResponseDto | null>(null);
  const [readiness, setReadiness] = useState<EnterpriseReadinessSummaryDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(task: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    const [nextProviders, nextMetadata, nextKeys, nextExports, nextSnapshots, nextEvidence, nextReadiness] =
      await Promise.all([
        run(() => listEnterpriseSsoProviders()),
        run(() => getEnterpriseSsoMetadata()),
        run(() => listEnterpriseKeyReferences()),
        run(() => listEnterpriseSiemExports()),
        run(() => listEnterpriseBackupSnapshots()),
        run(() => listEnterpriseComplianceEvidence()),
        run(() => getEnterpriseReadiness()),
      ]);
    if (nextProviders) setProviders(nextProviders);
    if (nextMetadata) setMetadata(nextMetadata);
    if (nextKeys) setKeys(nextKeys);
    if (nextExports) setExports(nextExports);
    if (nextSnapshots) setSnapshots(nextSnapshots);
    if (nextEvidence) setEvidence(nextEvidence);
    if (nextReadiness) setReadiness(nextReadiness);
  }

  async function saveSsoProvider() {
    const result = await run(() =>
      createEnterpriseSsoProvider({
        providerKey: providerKey.trim(),
        displayName: 'Corporate IdP',
        idpEntityId: 'corp-idp-entity',
        ssoUrlHash: sampleHash,
        certificateFingerprint: sampleFingerprint,
        metadataHash: sampleHash,
        defaultRole: 'matter_member',
        enforcementMode: 'password_disabled',
      }),
    );
    if (result) {
      setProviderId(result.providerId);
      await refreshAll();
    }
  }

  async function activateProvider() {
    const activeProviderId = providerId.trim() || providers?.providers[0]?.providerId || '';
    const result = await run(() => activateEnterpriseSsoProvider(activeProviderId));
    if (result) await refreshAll();
  }

  async function saveKeyReference() {
    const result = await run(() =>
      createEnterpriseKeyReference({
        keyLabel: 'Tenant HSM reference',
        keyProvider: 'hsm',
        keyRefHash: sampleHash,
        keyFingerprint: sampleHash,
      }),
    );
    if (result) {
      setKeyReferenceId(result.keyReferenceId);
      await refreshAll();
    }
  }

  async function verifyKey() {
    const activeKeyId = keyReferenceId.trim() || keys?.keys[0]?.keyReferenceId || '';
    const result = await run(() => verifyEnterpriseKeyReference(activeKeyId));
    if (result) await refreshAll();
  }

  async function recordSiemExport() {
    const result = await run(() =>
      createEnterpriseSiemExport({ sinkType: 'syslog', endpointHash: sampleHash }),
    );
    if (result) await refreshAll();
  }

  async function recordBackup() {
    const result = await run(() =>
      createEnterpriseBackupSnapshot({ scope: 'tenant', reasonCode: 'R13_GATE' }),
    );
    if (result) await refreshAll();
  }

  async function recordEvidence() {
    const result = await run(() =>
      createEnterpriseComplianceEvidence({
        framework: 'soc2',
        controlId: controlId.trim(),
        status: 'ready',
        evidenceRef: evidenceRef.trim(),
        evidenceHash: sampleHash,
      }),
    );
    if (result) await refreshAll();
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-64 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Provider key</label>
            <Input value={providerKey} onChange={(event) => setProviderKey(event.target.value)} />
          </div>
          <Button onClick={refreshAll} disabled={busy} title="Refresh enterprise readiness">
            <Building2 className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<Building2 className="h-4 w-4" />} label="Enterprise Controls" />
          <Button onClick={saveSsoProvider} disabled={busy || !providerKey.trim()}>
            <Building2 className="h-4 w-4" />
            Save SSO
          </Button>
          <Input
            aria-label="Provider ID"
            placeholder="Provider ID"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
          />
          <Button onClick={activateProvider} disabled={busy || !(providerId || providers?.providers[0])}>
            <CheckCircle2 className="h-4 w-4" />
            Activate SSO
          </Button>
          <Button onClick={saveKeyReference} disabled={busy}>
            <KeyRound className="h-4 w-4" />
            Save BYOK Ref
          </Button>
          <Input
            aria-label="Key reference ID"
            placeholder="Key reference ID"
            value={keyReferenceId}
            onChange={(event) => setKeyReferenceId(event.target.value)}
          />
          <Button onClick={verifyKey} disabled={busy || !(keyReferenceId || keys?.keys[0])}>
            <KeyRound className="h-4 w-4" />
            Verify Key
          </Button>
          <Button onClick={recordSiemExport} disabled={busy}>
            <RadioTower className="h-4 w-4" />
            SIEM Export
          </Button>
          <Button onClick={recordBackup} disabled={busy}>
            <DatabaseBackup className="h-4 w-4" />
            Backup Snapshot
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Control ID"
              value={controlId}
              onChange={(event) => setControlId(event.target.value)}
            />
            <Input
              aria-label="Evidence ref"
              value={evidenceRef}
              onChange={(event) => setEvidenceRef(event.target.value)}
            />
          </div>
          <Button onClick={recordEvidence} disabled={busy || !controlId.trim() || !evidenceRef.trim()}>
            <FileCheck2 className="h-4 w-4" />
            Evidence
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title="Readiness"
            rows={[
              ['SSO', String(readiness?.activeSsoProviderCount ?? 0)],
              ['BYOK', String(readiness?.activeKeyReferenceCount ?? 0)],
              ['SIEM', String(readiness?.siemExportCount ?? 0)],
              ['Backup', String(readiness?.backupSnapshotCount ?? 0)],
              ['Compliance gaps', String(readiness?.complianceGapCount ?? 0)],
              ['Technical pass', readiness?.technicalPass ? 'yes' : 'no'],
            ]}
          />
          <SummaryPanel
            title="SSO"
            rows={providers?.providers.map((item) => [
              item.providerKey,
              item.status,
              item.enforcementMode,
            ])}
            footer={metadata ? `SP ${metadata.entityId}` : undefined}
          />
          <SummaryPanel
            title="BYOK"
            rows={keys?.keys.map((item) => [item.keyProvider, item.status, item.keyFingerprint.slice(0, 12)])}
          />
          <SummaryPanel
            title="SIEM"
            rows={exports?.exports.map((item) => [
              item.sinkType,
              `${item.eventCount} events`,
              item.manifestHash.slice(0, 12),
            ])}
          />
          <SummaryPanel
            title="Backup"
            rows={snapshots?.snapshots.map((item) => [
              item.scope,
              `${item.tableCount} tables`,
              item.rowCountsHash.slice(0, 12),
            ])}
          />
          <SummaryPanel
            title="Compliance"
            rows={evidence?.evidence.map((item) => [
              item.framework,
              item.controlId,
              item.status,
            ])}
          />
        </div>
      </section>
    </main>
  );
}

function PanelTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function SummaryPanel({
  title,
  rows,
  footer,
}: {
  title: string;
  rows?: string[][] | undefined;
  footer?: string | undefined;
}) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {(rows?.length ? rows : [['No records', '', '']]).map((row, index) => (
          <div key={`${title}-${index}`} className="grid grid-cols-3 gap-3 text-sm">
            <span className="truncate font-medium">{row[0]}</span>
            <span className="truncate text-muted-foreground">{row[1]}</span>
            <span className="truncate text-muted-foreground">{row[2]}</span>
          </div>
        ))}
      </div>
      {footer ? <p className="mt-3 truncate text-xs text-muted-foreground">{footer}</p> : null}
    </section>
  );
}
