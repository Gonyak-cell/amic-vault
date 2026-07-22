import { describe, expect, it } from 'vitest';
import { fileSecurityScanSendOptions } from './file-scan-queue.service';

describe('fileSecurityScanSendOptions', () => {
  it('coalesces ten duplicate payloads by opaque quarantine reference', () => {
    const payload = { tenantId: '11111111-1111-4111-8111-111111111111', quarantineRef: '22222222-2222-4222-8222-222222222222', expectedSha256: 'a'.repeat(64) };
    const client = { query: async () => ({ rows: [] }) } as never;
    const keys = Array.from({ length: 10 }, () => fileSecurityScanSendOptions(payload, client).singletonKey);
    expect(new Set(keys)).toEqual(new Set([payload.quarantineRef]));
    expect(fileSecurityScanSendOptions(payload, client)).toMatchObject({ retryLimit: 3, deadLetter: 'security.file-scan.dead' });
  });
});
