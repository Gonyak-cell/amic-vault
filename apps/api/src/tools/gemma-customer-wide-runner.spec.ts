import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseGemmaCustomerWideArgs,
  runGemmaCustomerWide,
  type GemmaCustomerWideCliArgs,
} from './gemma-customer-wide-runner';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';

async function outputPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'gemma-customer-wide-test-'));
  return path.join(dir, 'receipt.sanitized.json');
}

function baseArgs(sanitizedOut: string): GemmaCustomerWideCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'gemma-customer-wide-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'approval-post-closeout-plan-20260628',
    controlRef: 'control-gemma-customer-wide',
    sanitizedOut,
    databaseUrl: 'postgres://unused',
    maxDocuments: 20_000,
  };
}

function basePlan() {
  return {
    tenantId,
    actorUserId,
    actorRole: 'firm_admin',
    activeEthicalWalls: 0,
    cutoverExecuted: true,
    gemmaIndexingAlreadyExecuted: false,
    aiAllowedTrueBefore: 3,
    counts: {
      documentsTotal: 22_299,
      readyIndexedEligible: 9_691,
      readyIndexedAlreadyAllowed: 2,
      readyIndexedTargetUpdate: 9_689,
      readyMissingIndex: 0,
      ocrPending: 4_760,
      failed: 7_848,
      deleted: 0,
      legalHold: 0,
      expectedRequiredArtifacts: 38_764,
      completedRequiredArtifacts: 8,
    },
    blockers: [],
  };
}

describe('gemma-customer-wide-runner', () => {
  it('requires one mode', () => {
    expect(() => parseGemmaCustomerWideArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseGemmaCustomerWideArgs([
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

  it('dry-runs the ready customer-wide lane without executing writes', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaCustomerWide(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(basePlan()),
      execute,
    });
    const serialized = await readFile(sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.counts.ready_indexed_target_update_document_count).toBe(9_689);
    expect(report.counts.expected_required_artifact_count).toBe(38_764);
    expect(report.ai_allowed_write_executed).toBe(false);
    expect(report.gemma_prep_executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(tenantId);
  });

  it('executes only when readiness passes', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn().mockResolvedValue({
      updatedDocumentCount: 9_689,
      auditEventId: '22222222-2222-4222-8222-222222222222',
    });

    const report = await runGemmaCustomerWide(
      { ...baseArgs(sanitizedOut), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(basePlan()), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.counts.updated_document_count).toBe(9_689);
    expect(report.gemma_indexing_executed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks when the ready lane exceeds the configured safety limit', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaCustomerWide(
      { ...baseArgs(sanitizedOut), maxDocuments: 10 },
      { plan: vi.fn().mockResolvedValue(basePlan()), execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('target_document_count_exceeds_limit');
    expect(execute).not.toHaveBeenCalled();
  });
});
