import { describe, expect, it } from 'vitest';
import {
  parseProbeEnvironment,
  runVersionedDisposalProbe,
} from './probe-versioned-disposal.mjs';

const safeEnvironment = {
  S3_DISPOSAL_PROBE_ALLOW: 'synthetic-disposable',
  S3_DISPOSAL_PROBE_VERSIONED_BUCKET: 'amic-vault-disposal-probe-versioned-20260722',
  S3_DISPOSAL_PROBE_UNVERSIONED_BUCKET: 'amic-vault-disposal-probe-unversioned-20260722',
  S3_DISPOSAL_PROBE_RUN_ID: '20260722probe',
};

describe('probe-versioned-disposal', () => {
  it('rejects non-disposable or non-explicit target configuration', () => {
    expect(() => parseProbeEnvironment({ ...safeEnvironment, S3_DISPOSAL_PROBE_ALLOW: 'true' })).toThrow(
      'PROBE_NOT_EXPLICITLY_ENABLED',
    );
    expect(() =>
      parseProbeEnvironment({ ...safeEnvironment, S3_DISPOSAL_PROBE_VERSIONED_BUCKET: 'amic-vault-dev' }),
    ).toThrow('PROBE_SCOPE_INVALID');
  });

  it('reports only bounded capability booleans after versioned and unversioned probes', async () => {
    const result = await runVersionedDisposalProbe({
      config: parseProbeEnvironment(safeEnvironment),
      createAdapter: (bucket) => ({ bucket }),
      probe: async (adapter) =>
        adapter.bucket.includes('versioned') && !adapter.bucket.includes('unversioned')
          ? { status: 'SUPPORTED' }
          : { status: 'UNSUPPORTED', reason: 'VERSIONING_DISABLED' },
    });

    expect(result).toEqual({
      schemaVersion: 'amic-vault.versioned-storage-disposal-probe/v1',
      status: 'PASS',
      exactInventory: true,
      exactHead: true,
      exactDelete: true,
      readbackAbsent: true,
      deleteMarker: true,
      wrongVersionDenied: true,
      crossTenantKeyDenied: true,
      unversionedRejected: true,
    });
    expect(JSON.stringify(result)).not.toContain('amic-vault-disposal-probe');
  });
});
