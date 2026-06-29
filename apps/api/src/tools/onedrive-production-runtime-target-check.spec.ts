import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProductionRuntimeTargetCheckArgs,
  runProductionRuntimeTargetCheck,
  type ProductionRuntimeTargetCheckCliArgs,
} from './onedrive-production-runtime-target-check';

const approvalRef = 'APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29';
const manifestApprovalRef = 'approval-ingest.sanitized.json';
const actorUserId = '11111111-1111-4111-8111-111111111101';

async function fixtureFiles(options: { ready?: boolean; forbiddenClaim?: boolean } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-production-runtime-check-test-'));
  const productionPreflight = path.join(dir, 'production-preflight.sanitized.json');
  const importDecision = path.join(dir, 'production-import-decision.sanitized.json');
  const pilotGate = path.join(dir, 'production-pilot-gate.sanitized.json');
  const sanitizedOut = path.join(dir, 'production-runtime-target-check.sanitized.json');
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
      production_import_executed: false,
    })}\n`,
    'utf8',
  );
  await writeFile(
    pilotGate,
    `${JSON.stringify({
      gate: 'production-pilot-import',
      status: ready ? 'ready_for_next_gate' : 'blocked',
      production_write_executed: false,
      production_import_executed: false,
      gemma_indexing_executed: options.forbiddenClaim === true,
    })}\n`,
    'utf8',
  );
  return { productionPreflight, importDecision, pilotGate, sanitizedOut };
}

function args(
  files: Awaited<ReturnType<typeof fixtureFiles>>,
): ProductionRuntimeTargetCheckCliArgs {
  return {
    dryRun: true,
    runId: 'production-runtime-target-test',
    approvalRef,
    manifestApprovalRef,
    productionPreflightPath: files.productionPreflight,
    importDecisionReceiptPath: files.importDecision,
    pilotGateReceiptPath: files.pilotGate,
    tenantSlug: 'amic',
    actorUserId,
    sanitizedOut: files.sanitizedOut,
    limit: 1,
    offset: 0,
  };
}

describe('onedrive-production-runtime-target-check', () => {
  it('parses dry-run mode and rejects execute mode', () => {
    expect(() => parseProductionRuntimeTargetCheckArgs([])).toThrow(/only --dry-run/);
    expect(() =>
      parseProductionRuntimeTargetCheckArgs(['--dry-run', '--execute']),
    ).toThrow(/only --dry-run/);
  });

  it('blocks when production runtime target env is missing', async () => {
    const files = await fixtureFiles();

    const report = await runProductionRuntimeTargetCheck(args(files), { env: {} });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_runtime_target_env_missing');
    expect(report.missing_runtime_requirements).toEqual([
      'database_target:DATABASE_URL_or_PGHOST_PGDATABASE_PGUSER',
      'source_object_access:AWS_PROFILE_or_aws_profile_arg_plus_AWS_REGION',
    ]);
    expect(report.execute_handoff).toMatchObject({
      status: 'blocked',
      required_wrapper_arg: '--runtime-target-check',
      blocked_by: ['production_runtime_target_env_missing'],
    });
    expect(report.production_import_executed).toBe(false);
    expect(report.acceptance_checks.production_runtime_target_present).toBe(false);
  });

  it('passes when production DB and source object access env are present', async () => {
    const files = await fixtureFiles();

    const report = await runProductionRuntimeTargetCheck(args(files), {
      env: {
        DATABASE_URL: 'postgres://secret.example/db',
        AWS_PROFILE: 'prod-private-profile',
        AWS_REGION: 'ap-northeast-2',
      },
    });

    expect(report.status).toBe('ready_for_pilot_execute');
    expect(report.blockers).toEqual([]);
    expect(report.runtime_env_presence).toMatchObject({
      DATABASE_URL: true,
      AWS_PROFILE: true,
      AWS_REGION: true,
      databaseTargetPresent: true,
      sourceObjectAccessPresent: true,
    });
    expect(report.missing_runtime_requirements).toEqual([]);
    expect(report.execute_handoff).toMatchObject({
      status: 'ready',
      required_wrapper_arg: '--runtime-target-check',
      bounded_scope: { limit: 1, offset: 0 },
      blocked_by: [],
    });
    expect(report.execute_handoff.next_command).toContain('pnpm onedrive:production-pilot-import');

    const receipt = await readFile(files.sanitizedOut, 'utf8');
    expect(receipt).not.toContain('postgres://secret.example/db');
    expect(receipt).not.toContain('prod-private-profile');
  });

  it('blocks if a forbidden production claim is already true', async () => {
    const files = await fixtureFiles({ forbiddenClaim: true });

    const report = await runProductionRuntimeTargetCheck(args(files), {
      env: {
        DATABASE_URL: 'postgres://secret.example/db',
        AWS_PROFILE: 'prod-private-profile',
        AWS_REGION: 'ap-northeast-2',
      },
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('forbidden_claim_state_not_false');
  });
});
