import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCloseoutGateArgs, runCloseoutGate } from './onedrive-closeout-gate-runner';

async function fixtureFiles(options: { preflightReady?: boolean; planText?: string } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-closeout-gate-test-'));
  const productionPreflight = path.join(dir, 'production-preflight.sanitized.json');
  const productionImportCloseout = path.join(dir, 'production-pilot-closeout.sanitized.json');
  const tuwPlan = path.join(dir, 'onedrive-closeout-main-production-tuw-plan.md');
  const sanitizedOut = path.join(dir, 'gate.sanitized.json');
  await writeFile(
    productionPreflight,
    `${JSON.stringify({
      status: options.preflightReady ? 'ready_for_production_import_decision' : 'blocked',
      production_write_executed: false,
      production_import_executed: false,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      counts: {
        approved_scope_rows: 22403,
        imported_or_reused_rows: 22286,
        allowed_skipped_rows: 117,
        active_documents: 22299,
        docs_with_all_4_real_gemma: 22299,
        real_gemma_outputs: 89196,
        fallback_payloads: 0,
      },
      acceptance_checks: {
        local_import_closeout_pass: true,
        local_full_closeout_pass: true,
        matter_linkage_closeout_pass: true,
        local_count_parity_pass: true,
        production_refs_present: options.preflightReady === true,
        evidence_index_leak_scan_pass: true,
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    productionImportCloseout,
    `${JSON.stringify({
      receipt_type: 'onedrive_production_pilot_closeout',
      status: 'PASS',
      production_write_executed: false,
      production_import_executed: true,
      production_source_of_truth_cutover_executed: false,
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
    })}\n`,
    'utf8',
  );
  await writeFile(tuwPlan, options.planText ?? 'safe plan text\n', 'utf8');
  return { productionPreflight, productionImportCloseout, tuwPlan, sanitizedOut };
}

function baseArgs(files: Awaited<ReturnType<typeof fixtureFiles>>) {
  return {
    dryRun: true,
    gate: 'production-import-decision' as const,
    runId: 'closeout-gate-test-run',
    productionPreflightPath: files.productionPreflight,
    tuwPlanPath: files.tuwPlan,
    sanitizedOut: files.sanitizedOut,
    approvalRef: undefined,
    productionImportCloseoutPath: undefined,
    productionCutoverReceiptPath: undefined,
    indexingExecuteReceiptPath: undefined,
    connectedStateReceiptPath: undefined,
    officeSyncReceiptPath: undefined,
  };
}

describe('onedrive-closeout-gate-runner', () => {
  it('parses a supported dry-run gate and rejects execute mode', () => {
    expect(() => parseCloseoutGateArgs(['--execute'])).toThrow(/only --dry-run is supported/);
    expect(() =>
      parseCloseoutGateArgs(['--dry-run', '--gate', 'unknown', '--run-id', 'x']),
    ).toThrow(/unsupported gate/);
  });

  it('blocks import decision when production preflight is blocked', async () => {
    const files = await fixtureFiles({ preflightReady: false });

    const report = await runCloseoutGate(baseArgs(files));

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_preflight_not_ready');
    expect(report.blockers).toContain('production_external_refs_missing');
    expect(report.production_import_executed).toBe(false);
  });

  it('marks import decision ready when production preflight is ready', async () => {
    const files = await fixtureFiles({ preflightReady: true });

    const report = await runCloseoutGate(baseArgs(files));
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_next_gate');
    expect(report.blockers).toEqual([]);
    expect(serialized).toContain('"production_write_executed": false');
  });

  it('requires a real Gemma indexing execute receipt before claim', async () => {
    const files = await fixtureFiles({ preflightReady: true });

    const report = await runCloseoutGate({ ...baseArgs(files), gate: 'gemma-indexing-claim' });

    expect(report.status).toBe('blocked');
    expect(report.gemma_indexing_executed).toBe(false);
    expect(report.blockers).toContain('gemma_indexing_execute_receipt_missing');
    expect(report.blockers).toContain('gemma_indexing_audit_receipt_missing');
  });

  it('requires pilot closeout and approval before production batch expansion', async () => {
    const files = await fixtureFiles({ preflightReady: true });

    const missing = await runCloseoutGate({
      ...baseArgs(files),
      gate: 'production-batch-expansion',
    });
    const ready = await runCloseoutGate({
      ...baseArgs(files),
      gate: 'production-batch-expansion',
      approvalRef: 'APPROVAL-ONEDRIVE-PROD-BATCH-EXPANSION-2026-06-29',
      productionImportCloseoutPath: files.productionImportCloseout,
    });

    expect(missing.status).toBe('blocked');
    expect(missing.blockers).toContain('production_batch_expansion_approval_ref_missing');
    expect(missing.blockers).toContain('production_pilot_closeout_receipt_missing_or_not_passed');
    expect(ready.status).toBe('ready_for_next_gate');
    expect(ready.production_import_executed).toBe(false);
    expect(ready.production_source_of_truth_cutover_executed).toBe(false);
  });

  it('defers OneDrive and Office product gates without making claims', async () => {
    const files = await fixtureFiles({ preflightReady: true });

    const connected = await runCloseoutGate({ ...baseArgs(files), gate: 'onedrive-connected-state' });
    const office = await runCloseoutGate({ ...baseArgs(files), gate: 'office-sync' });

    expect(connected.status).toBe('deferred_product_gate');
    expect(connected.onedrive_connected_state_claimed).toBe(false);
    expect(office.status).toBe('deferred_product_gate');
    expect(office.office_open_save_sync_claimed).toBe(false);
  });
});
