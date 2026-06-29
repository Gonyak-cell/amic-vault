import { describe, expect, it } from 'vitest';
import { parseGemmaCustomerWideRealOutputArgs } from './gemma-customer-wide-real-output-runner';

describe('gemma-customer-wide-real-output-runner', () => {
  it('parses dry-run options with bounded concurrency', () => {
    expect(
      parseGemmaCustomerWideRealOutputArgs([
        '--dry-run',
        '--run-id',
        'gemma-real-output',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
        '--limit',
        '20',
        '--concurrency',
        '12',
        '--documents-per-call',
        '120',
      ]),
    ).toMatchObject({
      dryRun: true,
      execute: false,
      limit: 20,
      concurrency: 8,
      documentsPerCall: 100,
      tenantSlug: 'amic',
    });
  });

  it('requires one execution mode', () => {
    expect(() =>
      parseGemmaCustomerWideRealOutputArgs([
        '--dry-run',
        '--execute',
        '--run-id',
        'gemma-real-output',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
      ]),
    ).toThrow(/exactly one/);
  });

  it('rejects invalid numeric options', () => {
    expect(() =>
      parseGemmaCustomerWideRealOutputArgs([
        '--execute',
        '--run-id',
        'gemma-real-output',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
        '--concurrency',
        '0',
      ]),
    ).toThrow(/positive integer/);
  });
});
