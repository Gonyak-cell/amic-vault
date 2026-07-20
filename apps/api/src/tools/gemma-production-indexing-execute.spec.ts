import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseGemmaProductionIndexingExecuteArgs,
  runGemmaProductionIndexingExecute,
  type GemmaProductionIndexingExecuteCliArgs,
} from './gemma-production-indexing-execute';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const cutoverId = '11111111-1111-4111-8111-111111111222';
const auditEventId = '11111111-1111-4111-8111-111111111333';

async function outputPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'gemma-prod-indexing-execute-test-'));
  return path.join(dir, 'receipt.sanitized.json');
}

function baseArgs(sanitizedOut: string): GemmaProductionIndexingExecuteCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'gemma-production-indexing-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'APPROVAL-GEMMA-PRODUCTION-INDEXING-EXECUTE-2026-07-01',
    controlRef: 'production-gemma-indexing-execute-control',
    sanitizedOut,
    databaseUrl: 'postgres://unused',
    expectedActiveDocuments: 22_299,
  };
}

function basePlan() {
  return {
    tenantId,
    actorUserId,
    actorRole: 'firm_admin',
    cutoverId,
    controlConstraintBlocksTrue: false,
    counts: {
      activeDocuments: 22_299,
      canonicalExtractionReady: 22_299,
      searchIndexedDocuments: 22_299,
      aiAllowedDocuments: 22_299,
      readyMissingSearchIndex: 0,
      ocrPending: 0,
      extractionFailed: 0,
      completedRequiredArtifacts: 89_196,
      realGemmaOutputs: 89_196,
      fallbackPayloads: 0,
      missingRequiredArtifacts: 0,
      staleRequiredArtifacts: 0,
      failedRequiredArtifacts: 0,
      docsWithAll4RealGemma: 22_299,
      activeChildChunks: 142_354,
      activeEmbeddings: 142_354,
      sourceCutoverRows: 1,
      gemmaIndexingExecutedRows: 0,
      activeEthicalWalls: 0,
    },
    permissionSmoke: {
      permissionFilteredVisibleDocuments: 22_299,
      permissionFilteredMatterCount: 123,
      documentsWithoutMatterMembership: 0,
      explicitDeniedOrUnsupportedConditionDocuments: 0,
    },
    blockers: [],
  };
}

describe('gemma-production-indexing-execute', () => {
  it('requires exactly one mode', () => {
    expect(() => parseGemmaProductionIndexingExecuteArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseGemmaProductionIndexingExecuteArgs([
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

  it('dry-runs without writing when all production acceptance checks pass', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaProductionIndexingExecute(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(basePlan()),
      execute,
    });
    const serialized = await readFile(sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.counts.active_documents).toBe(22_299);
    expect(report.counts.real_gemma_outputs).toBe(89_196);
    expect(report.permission_filtered_smoke.sql_stage_permission_filter_used).toBe(true);
    expect(report.gemma_indexing_executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(actorUserId);
  });

  it('executes the cutover flag and audit receipt only when readiness passes', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn().mockResolvedValue({
      cutoverId,
      auditEventId,
      tenantId,
      actorUserId,
      updatedCutoverRows: 1,
    });

    const report = await runGemmaProductionIndexingExecute(
      { ...baseArgs(sanitizedOut), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(basePlan()), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.gemma_indexing_executed).toBe(true);
    expect(report.updated_cutover_rows).toBe(1);
    expect(report.audit_event_ref).toMatch(/^[0-9a-f]{16}$/);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks while the legacy false-only control constraint is still present', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaProductionIndexingExecute(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue({ ...basePlan(), controlConstraintBlocksTrue: true }),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('gemma_indexing_control_constraint_not_migrated');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks when real Gemma artifacts do not cover every active document', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const plan = basePlan();
    plan.counts.docsWithAll4RealGemma = 22_298;
    plan.counts.realGemmaOutputs = 89_192;
    const report = await runGemmaProductionIndexingExecute(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(plan),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('docs_with_all_4_real_gemma_mismatch');
    expect(report.blockers).toContain('real_gemma_output_count_mismatch');
    expect(execute).not.toHaveBeenCalled();
  });
});
