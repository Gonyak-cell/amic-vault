import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileSecurityService } from './file-security.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const quarantineRef = '22222222-2222-4222-8222-222222222222';
const expectedSha256 = '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860';

afterEach(() => vi.unstubAllGlobals());

describe('FileSecurityService', () => {
  it('claims an opaque reference, records clean result and audit in one completion transaction', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '4', state: 'quarantined' }] };
      if (sql.includes('COALESCE(MAX(attempt_no)')) return { rows: [{ attempt_no: 1 }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const storage = { getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('safe')]) }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: 'clean', engine_version: '1.4.3', signature_age_seconds: 1 }), { status: 200 })));

    await new FileSecurityService(audit as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });

    expect(storage.getByStorageUri).toHaveBeenCalledWith(tenantId, `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringMatching(/\/security\/scan$/), expect.objectContaining({ headers: { 'x-amic-tenant-id': tenantId } }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_SCAN_COMPLETED', result: 'success', metadata: expect.objectContaining({ queue_name: 'security.file-scan' }) }), tx);
    const queryCalls = query.mock.calls as unknown as Array<[string, readonly unknown[]]>;
    expect(queryCalls.some(([sql, params]) => sql.includes('UPDATE file_security_scans') && params[2] === 'clean')).toBe(true);
    expect(queryCalls.some(([sql]) => sql.includes("state = 'scanning'") && sql.includes('observed_sha256 = NULL'))).toBe(true);
  });

  it('holds a hash mismatch without calling the worker', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '5', state: 'quarantined' }] };
      if (sql.includes('COALESCE(MAX(attempt_no)')) return { rows: [{ attempt_no: 1 }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const storage = { getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('wrong')]) }) };
    vi.stubGlobal('fetch', vi.fn());

    await new FileSecurityService(audit as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });

    expect(fetch).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_SECURITY_HELD', metadata: expect.objectContaining({ reason_code: 'hash_mismatch' }) }), tx);
  });
});
