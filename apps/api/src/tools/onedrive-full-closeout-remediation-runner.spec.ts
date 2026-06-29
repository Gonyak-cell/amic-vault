import { describe, expect, it } from 'vitest';
import { parseFullCloseoutRemediationArgs } from './onedrive-full-closeout-remediation-runner';

describe('onedrive-full-closeout-remediation-runner', () => {
  it('parses dry-run options with bounded concurrency', () => {
    expect(
      parseFullCloseoutRemediationArgs([
        '--dry-run',
        '--run-id',
        'full-closeout',
        '--tenant-slug',
        'amic',
        '--approval-ref',
        'approval-ref',
        '--control-ref',
        'control-ref',
        '--sanitized-out',
        'out.json',
        '--limit',
        '1000',
        '--concurrency',
        '32',
      ]),
    ).toMatchObject({
      dryRun: true,
      execute: false,
      runId: 'full-closeout',
      tenantSlug: 'amic',
      limit: 1000,
      concurrency: 16,
    });
  });

  it('requires exactly one execution mode', () => {
    expect(() =>
      parseFullCloseoutRemediationArgs([
        '--dry-run',
        '--execute',
        '--run-id',
        'full-closeout',
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
      parseFullCloseoutRemediationArgs([
        '--execute',
        '--run-id',
        'full-closeout',
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
