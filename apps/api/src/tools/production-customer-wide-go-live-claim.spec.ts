import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseProductionCustomerWideGoLiveClaimArgs,
  runProductionCustomerWideGoLiveClaim,
  type ProductionCustomerWideGoLiveClaimCliArgs,
} from './production-customer-wide-go-live-claim';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const cutoverId = '11111111-1111-4111-8111-111111111222';
const auditEventId = '11111111-1111-4111-8111-111111111333';

async function outputFile() {
  const dir = await mkdtemp(path.join(tmpdir(), 'customer-wide-go-live-claim-test-'));
  return path.join(dir, 'customer-wide-go-live-claim.sanitized.json');
}

function baseArgs(sanitizedOut: string): ProductionCustomerWideGoLiveClaimCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'customer-wide-go-live-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'APPROVAL-AMIC-PRODUCTION-CUSTOMER-WIDE-GO-LIVE-CLAIM-2026-07-01',
    controlRef: 'production-customer-wide-go-live-control',
    sanitizedOut,
    databaseUrl: 'postgres://unused',
    expectedActiveDocuments: null,
  };
}

function basePlan() {
  return {
    tenantId,
    actorUserId,
    actorRole: 'firm_admin',
    latestCutover: {
      cutoverId,
      onedriveConnectedStateClaimed: true,
      officeOpenSaveSyncClaimed: true,
      gemmaIndexingExecuted: true,
      customerWideGoLiveClaimed: false,
    },
    goLiveColumnPresent: true,
    counts: {
      sourceCutoverRows: 1,
      prerequisiteReadyRows: 1,
      goLiveClaimedRows: 0,
      activeDocuments: 22299,
      documentVersions: 22299,
      fileObjects: 22299,
      auditEvents: 100,
    },
    blockers: [],
  };
}

describe('production-customer-wide-go-live-claim', () => {
  it('requires exactly one execution mode', () => {
    expect(() => parseProductionCustomerWideGoLiveClaimArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseProductionCustomerWideGoLiveClaimArgs([
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

  it('dry-runs the go-live claim only when prerequisite gates are already passed', async () => {
    const sanitizedOut = await outputFile();
    const execute = vi.fn();

    const report = await runProductionCustomerWideGoLiveClaim(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(basePlan()),
      execute,
    });
    const serialized = await readFile(sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.customer_wide_go_live_claimed).toBe(false);
    expect(report.prerequisite_gates).toMatchObject({
      production_source_of_truth_cutover: true,
      gemma_indexing_executed: true,
      onedrive_connected_state_claimed: true,
      office_open_save_sync_claimed: true,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(actorUserId);
  });

  it('executes the go-live flag and audit receipt after all gates pass', async () => {
    const sanitizedOut = await outputFile();
    const execute = vi.fn().mockResolvedValue({
      cutoverId,
      auditEventId,
      tenantId,
      actorUserId,
      updatedCutoverRows: 1,
    });

    const report = await runProductionCustomerWideGoLiveClaim(
      { ...baseArgs(sanitizedOut), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(basePlan()), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.customer_wide_go_live_claimed).toBe(true);
    expect(report.not_executed_by_this_lane).toMatchObject({
      onedrive_connected_state_implementation: true,
      office_open_save_sync_implementation: true,
      gemma_indexing_execution: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks when any prerequisite gate has not passed', async () => {
    const sanitizedOut = await outputFile();
    const execute = vi.fn();
    const plan = {
      ...basePlan(),
      latestCutover: {
        ...basePlan().latestCutover,
        onedriveConnectedStateClaimed: false,
        officeOpenSaveSyncClaimed: false,
        gemmaIndexingExecuted: false,
      },
    };

    const report = await runProductionCustomerWideGoLiveClaim(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(plan),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('onedrive_connected_state_not_claimed');
    expect(report.blockers).toContain('office_open_save_sync_not_claimed');
    expect(report.blockers).toContain('gemma_indexing_not_executed');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks while the go-live control column is not migrated', async () => {
    const sanitizedOut = await outputFile();
    const execute = vi.fn();

    const report = await runProductionCustomerWideGoLiveClaim(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue({ ...basePlan(), goLiveColumnPresent: false }),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('customer_wide_go_live_control_column_not_migrated');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks when the optional active document expectation does not match', async () => {
    const sanitizedOut = await outputFile();
    const execute = vi.fn();

    const report = await runProductionCustomerWideGoLiveClaim(
      { ...baseArgs(sanitizedOut), expectedActiveDocuments: 22300 },
      { plan: vi.fn().mockResolvedValue(basePlan()), execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('expected_active_documents_mismatch');
    expect(execute).not.toHaveBeenCalled();
  });
});
