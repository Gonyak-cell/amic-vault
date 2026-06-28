import { describe, expect, it } from 'vitest';
import { parseGemmaCustomerWidePrepArgs } from './gemma-customer-wide-prep-runner';

describe('gemma-customer-wide-prep-runner', () => {
  it('requires exactly one mode', () => {
    expect(() => parseGemmaCustomerWidePrepArgs([])).toThrow(/exactly one/);
    expect(() =>
      parseGemmaCustomerWidePrepArgs([
        '--dry-run',
        '--execute',
        '--run-id',
        'run-a',
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

  it('parses bounded batch options', () => {
    expect(
      parseGemmaCustomerWidePrepArgs([
        '--dry-run',
        '--run-id',
        'gemma-cw-prep',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
        '--limit',
        '100',
      ]),
    ).toMatchObject({
      dryRun: true,
      execute: false,
      limit: 100,
      tenantSlug: 'amic',
    });
  });

  it('rejects non-positive limits', () => {
    expect(() =>
      parseGemmaCustomerWidePrepArgs([
        '--dry-run',
        '--run-id',
        'gemma-cw-prep',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
        '--limit',
        '0',
      ]),
    ).toThrow(/positive integer/);
  });
});
