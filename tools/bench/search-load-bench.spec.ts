import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyBenchEndpoint,
  percentile,
  runSearchLoadBench,
  syntheticDocumentSeed,
  uuidFromSeed,
  type SearchLoadBenchTransport,
} from './search-load-bench.ts';

const outputDir = path.resolve('tools/bench/output/search-load-test-output');

afterEach(() => {
  fs.rmSync(outputDir, { force: true, recursive: true });
});

describe('search load bench harness', () => {
  it('keeps the search benchmark on local or private endpoints', () => {
    expect(classifyBenchEndpoint('http://127.0.0.1:3001')).toBe('loopback');
    expect(classifyBenchEndpoint('http://amic-api.internal:3001')).toBe('private_network');
    expect(classifyBenchEndpoint('http://10.0.0.12:3001')).toBe('private_network');
    expect(classifyBenchEndpoint('https://api.openai.com')).toBe('blocked');
  });

  it('is default-off and does not call API, DB, or scale surfaces while disabled', async () => {
    const fetch = vi.fn();
    const report = await runSearchLoadBench({
      enabled: false,
      apiBaseUrl: 'http://127.0.0.1:3001',
      tenantId: '11111111-1111-4111-8111-111111111111',
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
      query: 'd9scale',
      modes: ['keyword'],
      samples: 1,
      concurrency: 1,
      pageSize: 10,
      recordScale: true,
      transport: { fetch },
      now: new Date('2026-07-05T00:00:00.000Z'),
    });

    expect(report.status).toBe('disabled');
    expect(report.outputPath).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('measures keyword latency and records scale evidence through the API', async () => {
    const calls: Array<{ url: string; body?: string | undefined; cookie?: string | undefined }> = [];
    const transport: SearchLoadBenchTransport = {
      async fetch(url, init) {
        calls.push({ url, body: init.body, cookie: init.headers?.cookie });
        if (url.endsWith('/v1/auth/login')) {
          return {
            ok: true,
            status: 201,
            headers: { get: () => 'amic_session=bench-session; Path=/; HttpOnly' },
            json: async () => ({}),
          };
        }
        if (url.endsWith('/v1/search')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ total: 1001, results: [] }),
          };
        }
        if (url.endsWith('/v1/scale/performance-runs')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ performanceRunId: '99999999-9999-4999-8999-999999999999' }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    };
    const clockValues = [0, 10, 10, 40, 40, 110];
    const report = await runSearchLoadBench({
      enabled: true,
      apiBaseUrl: 'http://127.0.0.1:3001',
      tenantId: '11111111-1111-4111-8111-111111111111',
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
      query: 'd9scale',
      modes: ['keyword'],
      samples: 3,
      concurrency: 1,
      pageSize: 10,
      recordScale: true,
      transport,
      outputDir,
      now: new Date('2026-07-05T00:00:00.000Z'),
      clock: () => {
        const next = clockValues.shift();
        if (next === undefined) throw new Error('clock exhausted');
        return next;
      },
    });

    expect(report.status).toBe('completed');
    expect(report.outputPath?.startsWith(outputDir)).toBe(true);
    expect(report.runs[0]).toEqual(
      expect.objectContaining({
        mode: 'keyword',
        p50Ms: 30,
        p95Ms: 70,
        p99Ms: 70,
        totalObserved: 1001,
        scalePerformanceRunId: '99999999-9999-4999-8999-999999999999',
      }),
    );
    const scaleCall = calls.find((call) => call.url.endsWith('/v1/scale/performance-runs'));
    expect(scaleCall?.cookie).toBe('amic_session=bench-session');
    expect(scaleCall?.body).toContain('"scenario":"search_query"');
    expect(scaleCall?.body).toMatch(/"measurementHash":"[a-f0-9]{64}"/u);
    const stored = fs.readFileSync(report.outputPath ?? '', 'utf8');
    expect(stored).not.toContain('bench-session');
    expect(stored).not.toContain('dev-alpha-firm-admin-password');
  });

  it('builds deterministic synthetic document identities for repeatable large seeds', () => {
    const first = syntheticDocumentSeed({ index: 7, query: 'd9scale' });
    const second = syntheticDocumentSeed({ index: 7, query: 'd9scale' });
    expect(first).toEqual(second);
    expect(first.documentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(first.contentText).toContain('d9scale');
    expect(first.embeddingHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(uuidFromSeed('d9-example')).toBe(uuidFromSeed('d9-example'));
  });

  it('uses nearest-rank percentiles for small smoke samples', () => {
    expect(percentile([10, 30, 70], 0.5)).toBe(30);
    expect(percentile([10, 30, 70], 0.95)).toBe(70);
  });
});
