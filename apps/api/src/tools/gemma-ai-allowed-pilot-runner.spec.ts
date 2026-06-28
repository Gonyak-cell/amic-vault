import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseGemmaAiAllowedPilotArgs,
  runGemmaAiAllowedPilot,
  type GemmaAiAllowedPilotCliArgs,
} from './gemma-ai-allowed-pilot-runner';

const matterId = '11111111-1111-4111-8111-111111111122';
const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';

async function outputPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'gemma-ai-allowed-pilot-test-'));
  return path.join(dir, 'gemma-ai-allowed-pilot.sanitized.json');
}

function baseArgs(sanitizedOut: string): GemmaAiAllowedPilotCliArgs {
  return {
    dryRun: true,
    execute: false,
    runId: 'gemma-ai-allowed-pilot-test',
    tenantSlug: 'amic',
    actorEmail: 'jwsuh@amic.kr',
    approvalRef: 'operator-chat-approval-2026-06-28-gemma-pilot-option-1',
    controlRef: 'gemma-ai-allowed-control-2026-06-28',
    sanitizedOut,
    databaseUrl: 'postgres://unused',
    matterIds: [matterId],
    maxDocuments: 25,
  };
}

function basePlan() {
  return {
    tenantId,
    actorUserId,
    actorRole: 'firm_admin',
    matterPlans: [
      {
        matterId,
        matterIdHash: 'matter-hash',
        documentCount: 3,
        targetDocumentCount: 2,
        alreadyAllowedDocumentCount: 1,
        legalHoldDocumentCount: 0,
        deletedDocumentCount: 0,
        missing: false,
      },
    ],
    activeEthicalWalls: 0,
    cutoverExecuted: true,
    gemmaIndexingAlreadyExecuted: false,
    aiAllowedTrueBefore: 0,
    aiAllowedFalseBefore: 22_299,
    blockers: [],
  };
}

function plan(overrides: Partial<ReturnType<typeof basePlan>> = {}) {
  return { ...basePlan(), ...overrides };
}

describe('gemma-ai-allowed-pilot-runner', () => {
  it('requires one mode and one matter selection source', () => {
    expect(() => parseGemmaAiAllowedPilotArgs([])).toThrow(
      /exactly one of --dry-run or --execute/,
    );
    expect(() =>
      parseGemmaAiAllowedPilotArgs([
        '--dry-run',
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
    ).toThrow(/selection source/);
  });

  it('rejects automatic smallest-matter selection for execute mode', () => {
    expect(() =>
      parseGemmaAiAllowedPilotArgs([
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
        '--select-smallest',
        '3',
      ]),
    ).toThrow(/dry-run only/);
  });

  it('loads an allowlist file and dry-runs without calling execute', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemma-ai-allowed-allowlist-test-'));
    const allowlistPath = path.join(dir, 'allowlist.local.json');
    const sanitizedOut = path.join(dir, 'receipt.sanitized.json');
    await writeFile(allowlistPath, `${JSON.stringify({ matter_ids: [matterId] })}\n`, 'utf8');
    const execute = vi.fn();

    const report = await runGemmaAiAllowedPilot(
      {
        ...baseArgs(sanitizedOut),
        matterIds: [],
        allowlistPath,
      },
      { plan: vi.fn().mockResolvedValue(plan()), execute },
    );
    const serialized = await readFile(sanitizedOut, 'utf8');

    expect(report.status).toBe('ready_for_execute');
    expect(report.ai_allowed_write_executed).toBe(false);
    expect(report.gemma_indexing_executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(serialized).not.toContain(matterId);
    expect(serialized).toContain('matter-hash');
  });

  it('executes the ai_allowed write adapter only when readiness passes', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn().mockResolvedValue({
      updatedDocumentCount: 2,
      auditEventId: '22222222-2222-4222-8222-222222222222',
      targetMatterId: matterId,
    });

    const report = await runGemmaAiAllowedPilot(
      { ...baseArgs(sanitizedOut), dryRun: false, execute: true },
      { plan: vi.fn().mockResolvedValue(plan()), execute },
    );

    expect(report.status).toBe('executed');
    expect(report.counts.updated_document_count).toBe(2);
    expect(report.gemma_indexing_executed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks when the pilot would allow too many documents', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaAiAllowedPilot(
      { ...baseArgs(sanitizedOut), maxDocuments: 1 },
      { plan: vi.fn().mockResolvedValue(plan()), execute },
    );

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('pilot_target_document_count_exceeds_limit');
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks when source cutover or ethical-wall gates are not ready', async () => {
    const sanitizedOut = await outputPath();
    const execute = vi.fn();

    const report = await runGemmaAiAllowedPilot(baseArgs(sanitizedOut), {
      plan: vi.fn().mockResolvedValue(
        plan({
          cutoverExecuted: false,
          activeEthicalWalls: 1,
        }),
      ),
      execute,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('source_of_truth_cutover_not_executed');
    expect(report.blockers).toContain('active_ethical_wall_review_required');
    expect(execute).not.toHaveBeenCalled();
  });
});
