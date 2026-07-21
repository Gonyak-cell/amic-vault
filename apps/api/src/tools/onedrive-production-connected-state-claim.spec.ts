import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseOneDriveConnectedStateClaimArgs,
  runOneDriveConnectedStateClaim,
  type OneDriveConnectedStateClaimCliArgs,
} from './onedrive-production-connected-state-claim';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const cutoverId = '11111111-1111-4111-8111-111111111222';
const auditEventId = '11111111-1111-4111-8111-111111111333';

async function fixtureFiles() {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-connected-claim-test-'));
  const verificationReceipt = path.join(dir, 'connected-state-verification.sanitized.json');
  const sanitizedOut = path.join(dir, 'connected-state-claim.sanitized.json');
  await writeFile(
    verificationReceipt,
    `${JSON.stringify({
      receipt_type: 'onedrive_connected_state_verification',
      status: 'PASS',
      onedrive_connected_state_verified: true,
      production_source_of_truth_cutover_executed: true,
      verification_scope: {
        production_surface_checked: true,
        provider_connection_checked: true,
      },
      prohibited_claims: {
        office_open_save_sync_claim: false,
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

function baseArgs(files: Awaited<ReturnType<typeof fixtureFiles>>): OneDriveConnectedStateClaimCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'onedrive-connected-state-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'APPROVAL-ONEDRIVE-PRODUCTION-CONNECTED-STATE-CLAIM-2026-07-01',
    controlRef: 'production-onedrive-connected-state-control',
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
      receipt_type: 'onedrive_connected_state_verification',
      status: 'PASS',
      onedrive_connected_state_verified: true,
      production_source_of_truth_cutover_executed: true,
      verification_scope: {
        production_surface_checked: true,
        provider_connection_checked: true,
      },
      prohibited_claims: {
        office_open_save_sync_claim: false,
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

describe('onedrive-production-connected-state-claim', () => {
  it('requires exactly one execution mode', () => {
    expect(() => parseOneDriveConnectedStateClaimArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseOneDriveConnectedStateClaimArgs([
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

  it('dry-runs the connected-state claim without writing', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();

    const report = await runOneDriveConnectedStateClaim(baseArgs(files), {
      plan: vi.fn().mockResolvedValue(basePlan(files)),
      execute,
    });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.onedrive_connected_state_claimed).toBe(false);
    expect(report.verification.verification_pass).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(actorUserId);
  });

  it('executes the connected-state flag and audit receipt only after verification passes', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn().mockResolvedValue({
      cutoverId,
      auditEventId,
      tenantId,
      actorUserId,
      updatedCutoverRows: 1,
    });

    const report = await runOneDriveConnectedStateClaim(
      { ...baseArgs(files), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(basePlan(files)), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.onedrive_connected_state_claimed).toBe(true);
    expect(report.prohibited_claims).toMatchObject({
      office_open_save_sync_claim: false,
      gemma_indexing_execution_claim: false,
      customer_wide_go_live_claim: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks when the verification receipt is missing', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();
    const plan = { ...basePlan(files), verification: null, verificationRef: null };

    const report = await runOneDriveConnectedStateClaim(
      { ...baseArgs(files), verificationReceiptPath: undefined },
      { plan: vi.fn().mockResolvedValue(plan), execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('connected_state_verification_receipt_missing');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks while the legacy false-only control constraint is still present', async () => {
    const files = await fixtureFiles();
    const execute = vi.fn();

    const report = await runOneDriveConnectedStateClaim(baseArgs(files), {
      plan: vi.fn().mockResolvedValue({ ...basePlan(files), controlConstraintBlocksTrue: true }),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('connected_state_control_constraint_not_migrated');
    expect(execute).not.toHaveBeenCalled();
  });
});
