import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProductionPilotCloseoutArgs,
  runProductionPilotCloseout,
  type ProductionPilotCloseoutCliArgs,
} from './onedrive-production-pilot-closeout-runner';

const actorUserId = '11111111-1111-4111-8111-111111111101';
const tenantSlug = 'amic';

async function fixtureFiles(options: { passed?: boolean; replayReady?: number } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-production-pilot-closeout-test-'));
  const productionPilotImport = path.join(dir, 'production-pilot-import.sanitized.json');
  const runtimeTargetCheck = path.join(dir, 'production-runtime-target-check.sanitized.json');
  const sanitizedOut = path.join(dir, 'production-pilot-closeout.sanitized.json');
  const passed = options.passed !== false;
  const replayReady = options.replayReady ?? 0;
  await writeFile(
    runtimeTargetCheck,
    `${JSON.stringify({
      receipt_type: 'onedrive_production_runtime_target_check',
      status: 'ready_for_pilot_execute',
      production_write_executed: false,
      production_import_executed: false,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      scope: {
        limit: 1,
        offset: 0,
        tenant_slug_hash: sha256(tenantSlug),
        actor_user_id_hash: sha256(actorUserId),
      },
      execute_handoff: {
        status: 'ready',
        required_wrapper_arg: '--runtime-target-check',
        required_receipt_ref: path.basename(runtimeTargetCheck),
        bounded_scope: { limit: 1, offset: 0 },
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    productionPilotImport,
    `${JSON.stringify({
      receipt_type: 'onedrive_production_pilot_import',
      mode: 'execute',
      status: passed ? 'pass' : 'blocked',
      production_write_executed: passed,
      production_import_executed: passed,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      scope: {
        bounded: true,
        limit: 1,
        offset: 0,
        tenant_slug_hash: sha256(tenantSlug),
        actor_user_id_hash: sha256(actorUserId),
      },
      import_runner: passed
        ? {
            gate_status: 'pass',
            processed_rows: 1,
            imported: 1,
            already_imported: 0,
            skipped: 0,
            blocked: 0,
            failed: 0,
            expected_created_counts: {
              documents: 1,
              file_objects: 1,
              initial_versions: 1,
              audit_events: 1,
            },
          }
        : null,
      replay_idempotency: {
        status: replayReady === 0 && passed ? 'PASS' : 'BLOCKED',
        already_imported: passed ? 1 : 0,
        ready: replayReady,
        blocked: 0,
        failed: 0,
      },
    })}\n`,
    'utf8',
  );
  return { productionPilotImport, runtimeTargetCheck, sanitizedOut };
}

function args(files: Awaited<ReturnType<typeof fixtureFiles>>): ProductionPilotCloseoutCliArgs {
  return {
    dryRun: true,
    runId: 'production-pilot-closeout-test',
    productionPilotImportPath: files.productionPilotImport,
    runtimeTargetCheckPath: files.runtimeTargetCheck,
    sanitizedOut: files.sanitizedOut,
    expectedLimit: 1,
    expectedOffset: 0,
  };
}

describe('onedrive-production-pilot-closeout-runner', () => {
  it('parses dry-run mode and rejects execute mode', () => {
    expect(() => parseProductionPilotCloseoutArgs([])).toThrow(/only --dry-run/);
    expect(() =>
      parseProductionPilotCloseoutArgs(['--dry-run', '--execute']),
    ).toThrow(/only --dry-run/);
  });

  it('passes a successful bounded production pilot execute receipt', async () => {
    const files = await fixtureFiles();

    const report = await runProductionPilotCloseout(args(files));
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('PASS');
    expect(report.blockers).toEqual([]);
    expect(report.production_import_executed).toBe(true);
    expect(report.acceptance_checks.replay_passed).toBe(true);
    expect(serialized).not.toContain(actorUserId);
  });

  it('blocks before production execute has passed', async () => {
    const files = await fixtureFiles({ passed: false });

    const report = await runProductionPilotCloseout(args(files));

    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toContain('production_pilot_import_not_passed');
    expect(report.blockers).toContain('production_import_not_executed');
    expect(report.production_import_executed).toBe(false);
  });

  it('blocks when replay still has ready rows', async () => {
    const files = await fixtureFiles({ replayReady: 1 });

    const report = await runProductionPilotCloseout(args(files));

    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toContain('production_import_replay_not_passed');
    expect(report.blockers).toContain('production_import_replay_has_ready_rows');
  });
});

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
