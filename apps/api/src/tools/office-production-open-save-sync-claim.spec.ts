import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseOfficeOpenSaveSyncClaimArgs,
  runOfficeOpenSaveSyncClaim,
  type OfficeOpenSaveSyncClaimCliArgs,
} from './office-production-open-save-sync-claim';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const cutoverId = '11111111-1111-4111-8111-111111111222';
const auditEventId = '11111111-1111-4111-8111-111111111333';

async function fixtureFiles() {
  const dir = await mkdtemp(path.join(tmpdir(), 'office-open-save-sync-claim-test-'));
  const verificationReceipt = path.join(dir, 'office-open-save-sync-verification.sanitized.json');
  const sanitizedOut = path.join(dir, 'office-open-save-sync-claim.sanitized.json');
  await writeFile(
    verificationReceipt,
    `${JSON.stringify({
      receipt_type: 'office_open_save_sync_verification',
      status: 'PASS',
      office_open_save_sync_verified: true,
      production_source_of_truth_cutover_executed: true,
      verification_scope: {
        production_surface_checked: true,
        office_open_checked: true,
        office_save_checked: true,
        office_sync_checked: true,
      },
      prohibited_claims: {
        onedrive_connected_state_claim: false,
        gemma_indexing_execution_claim: false,
        customer_wide_go_live_claim: false,
      },
      repo_safety: {
        raw_path_saved: false,
        document_body_saved: false,
        ocr_excerpt_saved: false,
        object_key_saved: false,
        token_saved: false,
        tenant_private_raw_value_saved: false,
        secret_printed: false,
      },
    })}\n`,
    'utf8',
  );
  return { verificationReceipt, sanitizedOut };
}

function baseArgs(files: Awaited<ReturnType<typeof fixtureFiles>>): OfficeOpenSaveSyncClaimCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'office-open-save-sync-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'APPROVAL-OFFICE-PRODUCTION-OPEN-SAVE-SYNC-CLAIM-2026-07-01',
    controlRef: 'production-office-open-save-sync-control',
    verificationReceiptPath: files.verificationReceipt,
    sanitizedOut: files.sanitizedOut,
    databaseUrl: 'postgres://unused',
  };
}

function basePlan(files: Awaited<ReturnType<typeof fixtureFiles>>) {
  return {
    tenantId,
    actorUserId,
    actorRole: 'firm_admin',
    cutoverId,
    controlConstraintBlocksTrue: false,
    counts: {
      sourceCutoverRows: 1,
      connectedStateClaimedRows: 0,
      officeSyncClaimedRows: 0,
      gemmaIndexingExecutedRows: 0,
    },
    verification: {
      receipt_type: 'office_open_save_sync_verification',
      status: 'PASS',
      office_open_save_sync_verified: true,
      production_source_of_truth_cutover_executed: true,
      verification_scope: {
        production_surface_checked: true,
        office_open_checked: true,
        office_save_checked: true,
        office_sync_checked: true,
      },
      prohibited_claims: {
        onedrive_connected_state_claim: false,
        gemma_indexing_execution_claim: false,
        customer_wide_go_live_claim: false,
      },
      repo_safety: {
        raw_path_saved: false,
        document_body_saved: false,
        ocr_excerpt_saved: false,
        object_key_saved: false,
        token_saved: false,
        tenant_private_raw_value_saved: false,
        secret_printed: false,
      },
    },
    verificationRef: path.basename(files.verificationReceipt),
    blockers: [],
  };
}

describe('office-production-open-save-sync-claim', () => {
  it('requires exactly one execution mode', () => {
    expect(() => parseOfficeOpenSaveSyncClaimArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseOfficeOpenSaveSyncClaimArgs([
        '--dry-run',
        '--execute',
        '--run-id',
        'run-a',
        '--tenant-slug',
        'amic',
        '--actor-email',
        'jwsuh@amic.kr',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
      ]),
    ).toThrow(/exactly one/);
  });

  it('dry-runs the Office open/save/sync claim without writing', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();

    const report = await runOfficeOpenSaveSyncClaim(baseArgs(files), {
      plan: vi.fn().mockResolvedValue(basePlan(files)),
      execute,
    });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.office_open_save_sync_claimed).toBe(false);
    expect(report.verification.verification_pass).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(actorUserId);
  });

  it('executes the Office flag and audit receipt only after verification passes', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn().mockResolvedValue({
      cutoverId,
      auditEventId,
      tenantId,
      actorUserId,
      updatedCutoverRows: 1,
    });

    const report = await runOfficeOpenSaveSyncClaim(
      { ...baseArgs(files), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(basePlan(files)), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.office_open_save_sync_claimed).toBe(true);
    expect(report.prohibited_claims).toMatchObject({
      onedrive_connected_state_claim: false,
      gemma_indexing_execution_claim: false,
      customer_wide_go_live_claim: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks when the verification receipt is missing', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();
    const plan = { ...basePlan(files), verification: null, verificationRef: null };

    const report = await runOfficeOpenSaveSyncClaim(
      { ...baseArgs(files), verificationReceiptPath: undefined },
      { plan: vi.fn().mockResolvedValue(plan), execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('office_open_save_sync_verification_receipt_missing');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks while the legacy false-only control constraint is still present', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();

    const report = await runOfficeOpenSaveSyncClaim(baseArgs(files), {
      plan: vi.fn().mockResolvedValue({ ...basePlan(files), controlConstraintBlocksTrue: true }),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('office_sync_control_constraint_not_migrated');
    expect(execute).not.toHaveBeenCalled();
  });
});
