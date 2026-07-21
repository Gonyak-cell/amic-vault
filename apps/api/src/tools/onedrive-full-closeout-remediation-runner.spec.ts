import { describe, expect, it } from 'vitest';
import { parseFullCloseoutRemediationArgs } from './onedrive-full-closeout-remediation-runner';

const ownerEnv = { DATABASE_MIGRATION_URL: 'postgres://amic_vault@localhost/amic_vault' };

describe('onedrive-full-closeout-remediation-runner', () => {
  it('parses dry-run options with bounded concurrency', () => {
    expect(
      parseFullCloseoutRemediationArgs(
        [
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
        ],
        ownerEnv,
      ),
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
      parseFullCloseoutRemediationArgs(
        [
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
        ],
        ownerEnv,
      ),
    ).toThrow(/exactly one/);
  });

  it('rejects invalid numeric options', () => {
    expect(() =>
      parseFullCloseoutRemediationArgs(
        [
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
        ],
        ownerEnv,
      ),
    ).toThrow(/positive integer/);
  });

  it('requires the explicit owner migration URL instead of DATABASE_URL fallback', () => {
    expect(() =>
      parseFullCloseoutRemediationArgs(
        [
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
        ],
        { DATABASE_URL: 'postgres://owner-fallback' },
      ),
    ).toThrow('DATABASE_MIGRATION_URL_REQUIRED');
  });
});
