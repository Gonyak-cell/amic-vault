import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseSourceCutoverExecuteArgs,
  runSourceCutoverExecute,
} from './onedrive-source-cutover-execute';

async function fixtureFiles(
  options: { closeoutGate?: string; preflightStatus?: string; readyRows?: number } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-source-cutover-execute-test-'));
  const importReceipt = path.join(dir, 'customer-wide-import-closeout.sanitized.json');
  const preflightReceipt = path.join(dir, 'source-cutover-preflight.approved.sanitized.json');
  const sanitizedOut = path.join(dir, 'source-cutover-execute.sanitized.json');
  await writeFile(
    importReceipt,
    `${JSON.stringify({
      receipt_type: 'customer_wide_import_closeout',
      gate_status: options.closeoutGate ?? 'pass',
      approved_scope_rows: 3,
      resolved_import_manifest_rows: 3,
      full_replay: {
        already_imported: 2,
        allowed_skipped: 1,
        ready: options.readyRows ?? 0,
        blocked: 0,
        failed: 0,
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    preflightReceipt,
    `${JSON.stringify({
      status: options.preflightStatus ?? 'ready_for_manual_cutover_decision',
      source_of_truth_cutover_executed: false,
      blockers: [],
      acceptance_checks: {
        separate_cutover_approval_ref_present: true,
        source_of_truth_control_ref_present: true,
        customer_wide_import_execute_pass: true,
        imported_or_reused_count_matches_resolved_manifest: true,
      },
      counts: {
        resolved_import_manifest_rows: 3,
        customer_wide_already_imported_rows: 2,
        customer_wide_allowed_skipped_rows: 1,
        customer_wide_accounted_rows: 3,
        customer_wide_ready_rows: 0,
        customer_wide_failed_rows: 0,
        customer_wide_blocked_rows: 0,
        target_resolution_conflict_rows: 0,
      },
    })}\n`,
    'utf8',
  );
  return { importReceipt, preflightReceipt, sanitizedOut };
}

function baseArgs(files: Awaited<ReturnType<typeof fixtureFiles>>) {
  return {
    dryRun: true,
    execute: false,
    runId: 'cutover-test-run',
    importReceiptPath: files.importReceipt,
    preflightReceiptPath: files.preflightReceipt,
    sanitizedOut: files.sanitizedOut,
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    cutoverApprovalRef: 'operator-chat-approval-2026-06-28-proceed',
    sourceOfTruthControlRef: 'local-vault-source-control-2026-06-28',
    databaseUrl: 'postgres://example',
  };
}

describe('onedrive-source-cutover-execute', () => {
  it('requires one execution mode and required receipt inputs', () => {
    expect(() => parseSourceCutoverExecuteArgs([])).toThrow(
      /exactly one of --dry-run or --execute is required/,
    );
    expect(() => parseSourceCutoverExecuteArgs(['--dry-run'])).toThrow(
      /--run-id is required/,
    );
  });

  it('dry-runs without writing to the DB adapter', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();

    const report = await runSourceCutoverExecute(baseArgs(files), { execute });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.source_of_truth_cutover_executed).toBe(false);
    expect(report.db_write_executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).toContain('OneDrive connected state');
  });

  it('executes a cutover control row and audit event through the DB adapter', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn().mockResolvedValue({
      cutoverId: '3f4d5f54-6061-4f93-8f00-769a220274a1',
      auditEventId: 'b142e7a6-d6f1-47a5-8a31-bac79c9120d0',
      tenantId: '87c1ff24-05da-4b6f-a3c0-a2a21e59ca91',
      actorUserId: '1ffdb4f1-a3d1-5e7a-bae8-4e3ae2dae4c6',
      reused: false,
    });

    const report = await runSourceCutoverExecute(
      { ...baseArgs(files), dryRun: false, execute: true },
      { execute },
    );

    expect(report.status).toBe('executed');
    expect(report.source_of_truth_cutover_executed).toBe(true);
    expect(report.safety_flags).toMatchObject({
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks execution when closeout readiness regresses', async () => {
    const files = await fixtureFiles({ readyRows: 1 });
    const execute = vi.fn();

    const report = await runSourceCutoverExecute(
      { ...baseArgs(files), dryRun: false, execute: true },
      { execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('customer_wide_import_has_ready_rows');
    expect(report.db_write_executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
