import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProductionPreflightArgs,
  runProductionPreflight,
} from './onedrive-production-preflight';

async function fixtureFiles(options: { matterStatus?: string; evidenceText?: string } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-production-preflight-test-'));
  const importCloseout = path.join(dir, 'customer-wide-import-closeout.sanitized.json');
  const fullCloseout = path.join(dir, 'full-closeout-final-reconciliation.sanitized.json');
  const matterLinkage = path.join(dir, 'matter-app-migration-db-linkage-closeout.sanitized.json');
  const evidenceIndex = path.join(dir, 'onedrive-closeout-evidence-index.md');
  const sanitizedOut = path.join(dir, 'production-preflight.sanitized.json');
  await writeFile(
    importCloseout,
    `${JSON.stringify({
      receipt_type: 'customer_wide_import_closeout',
      gate_status: 'pass',
      approved_scope_rows: 22403,
      resolved_import_manifest_rows: 22403,
      full_replay: {
        already_imported: 22286,
        allowed_skipped: 117,
        ready: 0,
        blocked: 0,
        failed: 0,
      },
      reconciliation: {
        imported_plus_allowed_skipped_equals_scope: true,
        no_blocked_rows_remaining: true,
        no_failed_rows_remaining: true,
        documents_versions_file_objects_equal: true,
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    fullCloseout,
    `${JSON.stringify({
      status: 'PASS',
      counts: {
        active_documents: 22299,
        canonical_extraction_ready: 22299,
        search_indexed_documents: 22299,
        ai_allowed_documents: 22299,
        docs_with_all_4_real_gemma: 22299,
        real_gemma_outputs: 89196,
        fallback_payloads: 0,
      },
    })}\n`,
    'utf8',
  );
  await writeFile(
    matterLinkage,
    `${JSON.stringify({
      status: options.matterStatus ?? 'pass',
      baseline_counts: {
        docsWithMatter: 22299,
      },
      acceptance_gate: {
        clients: 'PASS',
        matters: 'PASS',
        bridge_execute_pass: 'PASS',
      },
      leak_scan: { status: 'PASS', findings: [] },
    })}\n`,
    'utf8',
  );
  await writeFile(evidenceIndex, options.evidenceText ?? 'repo-safe evidence index\n', 'utf8');
  return { importCloseout, fullCloseout, matterLinkage, evidenceIndex, sanitizedOut };
}

function baseArgs(files: Awaited<ReturnType<typeof fixtureFiles>>) {
  return {
    dryRun: true,
    runId: 'prod-preflight-test-run',
    targetEnvironment: 'production',
    importCloseoutPath: files.importCloseout,
    fullCloseoutPath: files.fullCloseout,
    matterLinkageCloseoutPath: files.matterLinkage,
    evidenceIndexPath: files.evidenceIndex,
    sanitizedOut: files.sanitizedOut,
    productionDbRef: 'PROD-DB-SNAPSHOT-REF',
    storageContainmentRef: 'PROD-STORAGE-CONTAINMENT-REF',
    rollbackSnapshotRef: 'PROD-ROLLBACK-SNAPSHOT-REF',
    operatorRoleRef: 'PROD-OPERATOR-ROLE-REF',
    manifestRef: 'PROD-MANIFEST-REF',
    approvalRef: 'PROD-APPROVAL-REF',
  };
}

describe('onedrive-production-preflight', () => {
  it('requires dry-run mode and required local evidence inputs', () => {
    expect(() => parseProductionPreflightArgs([])).toThrow(/only --dry-run is supported/);
    expect(() => parseProductionPreflightArgs(['--dry-run'])).toThrow(/--run-id is required/);
    expect(() => parseProductionPreflightArgs(['--dry-run', '--execute'])).toThrow(
      /only --dry-run is supported/,
    );
  });

  it('blocks cleanly when production external refs are missing', async () => {
    const files = await fixtureFiles();
    const report = await runProductionPreflight({
      ...baseArgs(files),
      productionDbRef: undefined,
      storageContainmentRef: undefined,
      rollbackSnapshotRef: undefined,
      operatorRoleRef: undefined,
      manifestRef: undefined,
      approvalRef: undefined,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('production_external_refs_missing');
    expect(report.production_write_executed).toBe(false);
    expect(report.production_source_of_truth_cutover_executed).toBe(false);
  });

  it('passes ready-for-decision dry-run when local evidence and production refs are present', async () => {
    const files = await fixtureFiles();

    const report = await runProductionPreflight(baseArgs(files));
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_production_import_decision');
    expect(report.acceptance_checks).toMatchObject({
      local_import_closeout_pass: true,
      local_full_closeout_pass: true,
      matter_linkage_closeout_pass: true,
      production_refs_present: true,
      production_refs_safe: true,
      no_production_write: true,
      forbidden_claims_false: true,
    });
    expect(serialized).not.toContain('PROD-DB-SNAPSHOT-REF');
    expect(serialized).toContain('"production_write_executed": false');
  });

  it('blocks on evidence index leak patterns', async () => {
    const files = await fixtureFiles({ evidenceText: 'unsafe /Users/example/source path\n' });

    const report = await runProductionPreflight(baseArgs(files));

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('evidence_index_forbidden_pattern_detected');
  });
});
