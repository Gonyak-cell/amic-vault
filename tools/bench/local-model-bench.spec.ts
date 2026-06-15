import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyBenchEndpoint,
  runLocalModelBench,
  selectCandidates,
  type LocalBenchTransport,
} from './local-model-bench.ts';

const outputDir = path.resolve('tools/bench/output/test-output');

afterEach(() => {
  fs.rmSync(outputDir, { force: true, recursive: true });
});

describe('local model bench harness', () => {
  it('uses the same local/private endpoint boundary as the local gateway', () => {
    expect(classifyBenchEndpoint('http://127.0.0.1:11434')).toBe('loopback');
    expect(classifyBenchEndpoint('http://gemma:11434')).toBe('private_network');
    expect(classifyBenchEndpoint('http://192.168.1.20:11434')).toBe('private_network');
    expect(classifyBenchEndpoint('https://api.openai.com')).toBe('blocked');
  });

  it('is default-off and does not call local models while disabled', async () => {
    const fetch = vi.fn();
    const report = await runLocalModelBench({
      enabled: false,
      endpoint: 'http://127.0.0.1:11434',
      candidateIds: ['gemma4-12b-baseline'],
      fixtureDir: 'tests/fixtures/evalset-v0',
      transport: { fetch },
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(report.status).toBe('disabled');
    expect(report.outputPath).toBeNull();
    expect(report.caseCount).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes hash-only bench output under tools/bench/output', async () => {
    const transport: LocalBenchTransport = {
      async fetch() {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            response: '{"answer":"ok","source_refs":["doc:closed-contract-0001"],"warnings":[]}',
            prompt_eval_count: 11,
            eval_count: 7,
          }),
        };
      },
    };

    const report = await runLocalModelBench({
      enabled: true,
      endpoint: 'http://127.0.0.1:11434',
      candidateIds: ['gemma4-12b-baseline'],
      fixtureDir: 'tests/fixtures/evalset-v0',
      outputDir,
      transport,
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(report.status).toBe('completed');
    expect(report.outputPath?.startsWith(outputDir)).toBe(true);
    expect(report.runs).toHaveLength(2);
    expect(report.runs[0]).toEqual(
      expect.objectContaining({
        status: 'completed',
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    const stored = fs.readFileSync(report.outputPath ?? '', 'utf8');
    expect(stored).not.toContain('{"answer":"ok"');
    expect(stored).not.toContain('termination notice period clause');
  });

  it('rejects uncataloged candidates and external endpoints', async () => {
    expect(() => selectCandidates(['unknown-model'])).toThrow(/unknown bench candidate/);
    await expect(
      runLocalModelBench({
        enabled: true,
        endpoint: 'https://api.openai.com',
        candidateIds: ['gemma4-12b-baseline'],
        fixtureDir: 'tests/fixtures/evalset-v0',
      }),
    ).rejects.toThrow(/loopback or private/);
  });
});
