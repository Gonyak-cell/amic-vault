import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSecurityService } from './file-security.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const quarantineRef = '22222222-2222-4222-8222-222222222222';
const expectedSha256 = '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'loopback-dev');
});

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

    const promotion = { promote: vi.fn().mockResolvedValue({}) };
    await new FileSecurityService(audit as never, promotion as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });

    expect(storage.getByStorageUri).toHaveBeenCalledWith(tenantId, `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringMatching(/\/security\/scan$/), expect.objectContaining({
      headers: expect.objectContaining({
        'x-amic-tenant-id': tenantId,
        'x-amic-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/),
        'x-amic-ingestion-nonce': expect.stringMatching(/^[0-9a-f-]{36}$/),
        'x-amic-ingestion-expires-at': expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
        'x-amic-dev-loopback-identity': 'true',
      }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_SCAN_COMPLETED', result: 'success', metadata: expect.objectContaining({ queue_name: 'security.file-scan' }) }), tx);
    const queryCalls = query.mock.calls as unknown as Array<[string, readonly unknown[]]>;
    expect(queryCalls.some(([sql, params]) => sql.includes('UPDATE file_security_scans') && params[2] === 'clean')).toBe(true);
    expect(queryCalls.some(([sql]) => sql.includes("state = 'scanning'") && sql.includes("result_code = 'pending'") && sql.includes('observed_sha256 = NULL'))).toBe(true);
    expect(promotion.promote).toHaveBeenCalledWith({ tenantId, quarantineRef, expectedSha256 });
  });

  it('uses the private gateway profile binding and leaves gateway identity injection to the gateway', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'private-gateway-mtls');
    vi.stubEnv('INGESTION_GATEWAY_MTLS_ENABLED', 'true');
    vi.stubEnv('INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS', 'true');
    vi.stubEnv('INGESTION_GATEWAY_DIRECT_WORKER_ACCESS', 'blocked');
    vi.stubEnv('INGESTION_GATEWAY_WORKLOAD_SUBJECT', 'amic-vault-api');
    vi.stubEnv('INGESTION_GATEWAY_AUDIENCE', 'amic-vault-ingestion');
    vi.stubEnv('INGESTION_WORKER_URL', 'https://ingestion-gateway.internal');
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '4', state: 'quarantined' }] };
      if (sql.includes('COALESCE(MAX(attempt_no)')) return { rows: [{ attempt_no: 1 }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const storage = { getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('safe')]) }) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: 'clean', engine_version: '1.4.3', signature_age_seconds: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new FileSecurityService(audit as never, { promote: vi.fn().mockResolvedValue({}) } as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toEqual(expect.objectContaining({
      'x-amic-tenant-id': tenantId,
      'x-amic-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/),
      'x-amic-ingestion-nonce': expect.stringMatching(/^[0-9a-f-]{36}$/),
      'x-amic-ingestion-expires-at': expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    }));
    expect(init?.headers).not.toHaveProperty('x-amic-dev-loopback-identity');
    expect(init?.headers).not.toHaveProperty('x-amic-gateway-mtls-verified');
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

    await new FileSecurityService(audit as never, { promote: vi.fn() } as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });

    expect(fetch).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_SECURITY_HELD', metadata: expect.objectContaining({ reason_code: 'hash_mismatch' }) }), tx);
  });

  it('keeps a legacy clean scan closed when its immutable promotion input is absent', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '4', state: 'clean' }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const promotion = { promote: vi.fn().mockRejectedValue(new Error('FILE_SECURITY_PROMOTION_INPUT_MISSING')) };

    await expect(new FileSecurityService(audit as never, promotion as never, { getByStorageUri: vi.fn() } as never).handle({ tenantId, quarantineRef, expectedSha256 })).resolves.toBeUndefined();

    expect(promotion.promote).toHaveBeenCalledWith({ tenantId, quarantineRef, expectedSha256 });
  });

  it('accepts an infected verdict without scanner metadata so detection details stay outside Vault', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '4', state: 'quarantined' }] };
      if (sql.includes('COALESCE(MAX(attempt_no)')) return { rows: [{ attempt_no: 1 }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const storage = { getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('safe')]) }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: 'infected' }), { status: 200 })));
    await new FileSecurityService(audit as never, { promote: vi.fn() } as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'FILE_SCAN_COMPLETED',
      result: 'success',
      metadata: expect.objectContaining({ reason_code: 'infected' }),
    }), expect.anything());
  });

  it.each([
    ['malformed worker response', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })), 'malformed_response'],
    ['worker timeout', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')), 'scanner_timeout'],
  ])('fails closed on %s', async (_label, fetchMock, expectedCode) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM file_security_scans')) return { rows: [{ scan_id: '33333333-3333-4333-8333-333333333333', matter_id: '44444444-4444-4444-8444-444444444444', quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`, size_bytes: '4', state: 'quarantined' }] };
      if (sql.includes('COALESCE(MAX(attempt_no)')) return { rows: [{ attempt_no: 1 }] };
      return { rows: [] };
    });
    const tx = { query };
    const audit = { transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)), log: vi.fn().mockResolvedValue({}) };
    const storage = { getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('safe')]) }) };
    vi.stubGlobal('fetch', fetchMock);
    await new FileSecurityService(audit as never, { promote: vi.fn() } as never, storage as never).handle({ tenantId, quarantineRef, expectedSha256 });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_SCAN_COMPLETED', result: 'failure', metadata: expect.objectContaining({ reason_code: expectedCode }) }), tx);
  });
});
