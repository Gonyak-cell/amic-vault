import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseSourceCutoverPreflightArgs,
  runSourceCutoverPreflight,
} from './onedrive-source-cutover-preflight';

async function fixtureFiles(
  options: { importMode?: string; importGate?: string; closeoutReceipt?: boolean } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-source-cutover-preflight-test-'));
  const importReceipt = path.join(dir, 'customer-wide-import.json');
  const targetResolution = path.join(dir, 'target-resolution.json');
  const sanitizedOut = path.join(dir, 'cutover-preflight.json');
  await writeFile(
    importReceipt,
    `${JSON.stringify(
      options.closeoutReceipt
        ? {
            receipt_type: 'customer_wide_import_closeout',
            gate_status: options.importGate ?? 'pass',
            full_replay: {
              already_imported: 2,
              allowed_skipped: 1,
              ready: 0,
              blocked: 0,
              failed: 0,
            },
          }
        : {
            mode: options.importMode ?? 'customer-wide-import',
            gate_status: options.importGate ?? 'pass',
            summary: {
              total_items: 2,
              status_counts: {
                imported: 1,
                already_imported: 1,
              },
            },
          },
    )}\n`,
    'utf8',
  );
  await writeFile(
    targetResolution,
    `${JSON.stringify({
      status: 'ready_for_pilot_import_dry_run',
      resolved_import_manifest_rows: options.closeoutReceipt ? 3 : 2,
      conflict_rows: 0,
    })}\n`,
    'utf8',
  );
  return { importReceipt, targetResolution, sanitizedOut };
}

describe('onedrive-source-cutover-preflight', () => {
  it('requires its receipt inputs', () => {
    expect(() => parseSourceCutoverPreflightArgs([])).toThrow(/--import-receipt is required/);
  });

  it('passes only to a manual cutover decision state without executing cutover', async () => {
    const files = await fixtureFiles();

    const report = await runSourceCutoverPreflight({
      importReceiptPath: files.importReceipt,
      targetResolutionReceiptPath: files.targetResolution,
      sanitizedOut: files.sanitizedOut,
      cutoverApprovalRef: 'cutover-approval-ref',
      sourceOfTruthControlRef: 'source-control-ref',
      executeRequested: false,
    });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_manual_cutover_decision');
    expect(report.source_of_truth_cutover_executed).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(serialized.includes('source-of-truth cutover mutation')).toBe(true);
  });

  it('accepts final closeout receipts with allowed skipped rows', async () => {
    const files = await fixtureFiles({ closeoutReceipt: true });

    const report = await runSourceCutoverPreflight({
      importReceiptPath: files.importReceipt,
      targetResolutionReceiptPath: files.targetResolution,
      sanitizedOut: files.sanitizedOut,
      cutoverApprovalRef: 'cutover-approval-ref',
      sourceOfTruthControlRef: 'source-control-ref',
      executeRequested: false,
    });

    expect(report.status).toBe('ready_for_manual_cutover_decision');
    expect(report.blockers).toEqual([]);
    expect(report.counts.customer_wide_allowed_skipped_rows).toBe(1);
    expect(report.counts.customer_wide_accounted_rows).toBe(3);
  });

  it('blocks dry-run import receipts and missing cutover controls', async () => {
    const files = await fixtureFiles({ importMode: 'customer-wide-import-dry-run' });

    const report = await runSourceCutoverPreflight({
      importReceiptPath: files.importReceipt,
      targetResolutionReceiptPath: files.targetResolution,
      sanitizedOut: files.sanitizedOut,
      executeRequested: true,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('source_of_truth_cutover_execution_not_implemented');
    expect(report.blockers).toContain('cutover_approval_ref_missing');
    expect(report.blockers).toContain('source_of_truth_control_ref_missing');
    expect(report.blockers).toContain('customer_wide_import_execute_receipt_missing');
  });
});
