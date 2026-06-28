import { describe, expect, it } from 'vitest';
import { parseGemmaCustomerWideFallbackCloseoutArgs } from './gemma-customer-wide-fallback-closeout-runner';

describe('gemma customer-wide fallback closeout runner args', () => {
  it('parses a bounded dry-run command with a default limit', () => {
    expect(
      parseGemmaCustomerWideFallbackCloseoutArgs(
        [
          '--dry-run',
          '--run-id',
          'gemma-cw-fallback-dry-run',
          '--tenant-slug',
          'amic',
          '--approval-ref',
          'approval-gemma-cw',
          '--control-ref',
          'control-gemma-cw',
          '--sanitized-out',
          '.omo/evidence/out.json',
        ],
        { DATABASE_URL: 'postgres://example' },
      ),
    ).toEqual(
      expect.objectContaining({
        dryRun: true,
        execute: false,
        databaseUrl: 'postgres://example',
        limit: 5000,
      }),
    );
  });

  it('requires exactly one execution mode', () => {
    expect(() =>
      parseGemmaCustomerWideFallbackCloseoutArgs([
        '--dry-run',
        '--execute',
        '--run-id',
        'gemma-cw-fallback',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-gemma-cw',
        '--control-ref',
        'control-gemma-cw',
        '--sanitized-out',
        '.omo/evidence/out.json',
      ]),
    ).toThrow(/exactly one/u);
  });

  it('rejects non-positive limits', () => {
    expect(() =>
      parseGemmaCustomerWideFallbackCloseoutArgs([
        '--execute',
        '--run-id',
        'gemma-cw-fallback',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-gemma-cw',
        '--control-ref',
        'control-gemma-cw',
        '--sanitized-out',
        '.omo/evidence/out.json',
        '--limit',
        '0',
      ]),
    ).toThrow(/--limit/u);
  });
});
