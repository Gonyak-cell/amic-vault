import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  parseProductionPilotImportArgs,
  runProductionPilotImport,
  type ProductionPilotImportCliArgs,
} from './onedrive-production-pilot-import-runner';

const approvalRef = 'APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29';
const manifestApprovalRef = 'approval-ingest.sanitized.json';
const actorUserId = '11111111-1111-4111-8111-111111111101';

async function fixtureFiles(options: { ready?: boolean; handoffRefMismatch?: boolean } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-production-pilot-import-test-'));
  const productionPreflight = path.join(dir, 'production-preflight.sanitized.json');
  const importDecision = path.join(dir, 'production-import-decision.sanitized.json');
  const pilotGate = path.join(dir, 'production-pilot-gate.sanitized.json');
  const runtimeTargetCheck = path.join(dir, 'production-runtime-target-check.sanitized.json');
  const sanitizedOut = path.join(dir, 'production-pilot.sanitized.json');
  const localReceiptOut = path.join(dir, 'production-pilot.local.ndjson');
  const statePath = path.join(dir, 'production-pilot-state.local.json');
  const manifest = path.join(dir, 'manifest.ndjson');
  const scope = path.join(dir, 'scope.ndjson');
  const ready = options.ready !== false;
  await writeFile(
    productionPreflight,
    `${JSON.stringify({
      status: ready ? 'ready_for_production_import_decision' : 'blocked',
      production_write_executed: false,
      production_import_executed: false,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      acceptance_checks: {
        production_refs_present: ready,
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    importDecision,
    `${JSON.stringify({
      gate: 'production-import-decision',
      status: ready ? 'ready_for_next_gate' : 'blocked',
      production_write_executed: false,
    })}\n`,
    'utf8',
  );
  await writeFile(
    pilotGate,
    `${JSON.stringify({
      gate: 'production-pilot-import',
      status: ready ? 'ready_for_next_gate' : 'blocked',
      production_write_executed: false,
    })}\n`,
    'utf8',
  );
  await writeFile(
    runtimeTargetCheck,
    `${JSON.stringify({
      receipt_type: 'onedrive_production_runtime_target_check',
      status: ready ? 'ready_for_pilot_execute' : 'blocked',
      production_write_executed: false,
      production_import_executed: false,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      scope: {
        limit: 1,
        offset: 0,
        tenant_slug_hash: sha256('amic'),
        actor_user_id_hash: sha256(actorUserId),
      },
      runtime_env_presence: {
        databaseTargetPresent: ready,
        sourceObjectAccessPresent: ready,
      },
      execute_handoff: {
        status: ready ? 'ready' : 'blocked',
        required_receipt_ref: options.handoffRefMismatch
          ? 'different-runtime-target-check.sanitized.json'
          : path.basename(runtimeTargetCheck),
        required_wrapper_arg: '--runtime-target-check',
        bounded_scope: {
          limit: 1,
          offset: 0,
        },
      },
    })}\n`,
    'utf8',
  );
  await writeFile(manifest, '{}\n', 'utf8');
  await writeFile(scope, '{}\n', 'utf8');
  return {
    productionPreflight,
    importDecision,
    pilotGate,
    runtimeTargetCheck,
    sanitizedOut,
    localReceiptOut,
    statePath,
    manifest,
    scope,
  };
}

function args(
  files: Awaited<ReturnType<typeof fixtureFiles>>,
  execute = false,
  includeRuntimeTargetCheck = false,
): ProductionPilotImportCliArgs {
  return {
    dryRun: !execute,
    execute,
    runId: 'production-pilot-test',
    approvalRef,
    manifestApprovalRef,
    productionPreflightPath: files.productionPreflight,
    importDecisionReceiptPath: files.importDecision,
    pilotGateReceiptPath: files.pilotGate,
    runtimeTargetCheckPath: includeRuntimeTargetCheck ? files.runtimeTargetCheck : undefined,
    manifestPath: files.manifest,
    scopePath: files.scope,
    tenantSlug: 'amic',
    actorUserId,
    sanitizedOut: files.sanitizedOut,
    localReceiptOut: files.localReceiptOut,
    statePath: files.statePath,
    limit: 1,
    offset: 0,
    maxFailures: 1,
    cutoverPolicy: 'not_requested',
  };
}

function importReport(status: 'ready' | 'imported' | 'already_imported') {
  return {
    gate_status: 'pass',
    mode: status === 'imported' ? 'customer-wide-import' : 'customer-wide-import-dry-run',
    processed_rows: 1,
    local_receipt_rows_written: status === 'imported' ? 1 : 0,
    summary: {
      status_counts: { [status]: 1 },
      reason_counts: {},
      expected_created_counts: {
        documents: status === 'ready' ? 1 : 0,
        file_objects: status === 'ready' ? 1 : 0,
        initial_versions: status === 'ready' ? 1 : 0,
        audit_events: status === 'ready' ? 1 : 0,
      },
    },
  };
}

describe('onedrive-production-pilot-import-runner', () => {
  it('parses mode and rejects ambiguous execution mode', () => {
    expect(() => parseProductionPilotImportArgs([])).toThrow(/exactly one/);
    expect(() => parseProductionPilotImportArgs(['--dry-run', '--execute'])).toThrow(/exactly one/);
  });

  it('marks an approved bounded pilot dry-run ready for execute without production write', async () => {
    const files = await fixtureFiles();
    const runImport = vi.fn(async () => importReport('ready'));

    const report = await runProductionPilotImport(args(files), { runImport });

    expect(report.blockers).toEqual([]);
    expect(report.status).toBe('ready_for_execute');
    expect(report.production_import_executed).toBe(false);
    expect(report.import_runner).toMatchObject({ ready: 1, blocked: 0, failed: 0 });
    expect(report.tuw_status['PROD-IMPORT-004']).toBe('READY_NOT_EXECUTED');
    expect(runImport).toHaveBeenCalledOnce();
  });

  it('blocks execute when production runtime target env is missing', async () => {
    const files = await fixtureFiles();
    const runImport = vi.fn(async () => importReport('imported'));

    const report = await runProductionPilotImport(args(files, true), { env: {}, runImport });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_runtime_target_env_missing');
    expect(report.production_import_executed).toBe(false);
    expect(runImport).not.toHaveBeenCalled();
  });

  it('executes and then verifies replay idempotency when runtime target is present', async () => {
    const files = await fixtureFiles();
    const runImport = vi
      .fn()
      .mockResolvedValueOnce(importReport('imported'))
      .mockResolvedValueOnce(importReport('already_imported'));

    const report = await runProductionPilotImport(args(files, true, true), {
      env: {
        DATABASE_URL: 'present',
        AWS_PROFILE: 'prod',
        AWS_REGION: 'ap-northeast-2',
      },
      runImport,
    });

    expect(report.blockers).toEqual([]);
    expect(report.status).toBe('pass');
    expect(report.production_import_executed).toBe(true);
    expect(report.replay_idempotency).toMatchObject({ status: 'PASS', already_imported: 1 });
    expect(report.tuw_status['PROD-IMPORT-006']).toBe('PASS');
    expect(runImport).toHaveBeenCalledTimes(2);
  });

  it('blocks execute when runtime target check receipt is missing even if env is present', async () => {
    const files = await fixtureFiles();
    const runImport = vi.fn(async () => importReport('imported'));

    const report = await runProductionPilotImport(args(files, true), {
      env: {
        DATABASE_URL: 'present',
        AWS_PROFILE: 'prod',
        AWS_REGION: 'ap-northeast-2',
      },
      runImport,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_runtime_target_check_receipt_missing');
    expect(report.production_import_executed).toBe(false);
    expect(runImport).not.toHaveBeenCalled();
  });

  it('blocks execute when runtime target check handoff does not match the receipt path', async () => {
    const files = await fixtureFiles({ handoffRefMismatch: true });
    const runImport = vi.fn(async () => importReport('imported'));

    const report = await runProductionPilotImport(args(files, true, true), {
      env: {
        DATABASE_URL: 'present',
        AWS_PROFILE: 'prod',
        AWS_REGION: 'ap-northeast-2',
      },
      runImport,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_runtime_target_check_handoff_ref_mismatch');
    expect(report.production_import_executed).toBe(false);
    expect(runImport).not.toHaveBeenCalled();
  });
});

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
