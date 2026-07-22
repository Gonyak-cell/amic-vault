import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fileSecurityReconcileCron,
  fileSecurityReconcileQueueName,
  FileSecurityReconcilerService,
  isFileSecurityReconcilerWorkerEnabled,
} from './file-security-reconciler.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const scanId = '33333333-3333-4333-8333-333333333333';
const matterId = '44444444-4444-4444-8444-444444444444';
const quarantineRef = '55555555-5555-4555-8555-555555555555';
const expectedSha256 = 'a'.repeat(64);

const previousEnv = { ...process.env };
afterEach(() => {
  process.env = { ...previousEnv };
  vi.restoreAllMocks();
});

function row(overrides: Record<string, unknown> = {}) {
  const rowQuarantineRef = typeof overrides.quarantine_ref === 'string' ? overrides.quarantine_ref : quarantineRef;
  return {
    tenant_id: tenantId,
    scan_id: scanId,
    matter_id: matterId,
    quarantine_ref: rowQuarantineRef,
    quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${rowQuarantineRef}`,
    expected_sha256: expectedSha256,
    state: 'error',
    result_code: 'scanner_error',
    signature_at: null,
    promotion_file_object_id: null,
    primary_storage_uri: null,
    legal_hold: false,
    ...overrides,
  };
}

function database(query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) {
  const tx = { query };
  return {
    tenantTransaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    listActiveTenantRegistryIds: vi.fn(async () => [tenantId]),
  };
}

function audit(tx: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> }) {
  return {
    transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    log: vi.fn(async () => ({ eventId: 'audit-event', createdAt: new Date() })),
  };
}

describe('FileSecurityReconcilerService', () => {
  it('classifies every orphan class through bounded metadata-only checks without invoking a scanner', async () => {
    const refs = [
      '66666666-6666-4666-8666-666666666666',
      quarantineRef,
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
    ];
    const scans = [
      row(),
      row({ scan_id: '77777777-7777-4777-8777-777777777701', quarantine_ref: refs[2], state: 'clean', result_code: 'clean', signature_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }),
      row({ scan_id: '88888888-8888-4888-8888-888888888801', quarantine_ref: refs[3], state: 'promoted', promotion_file_object_id: '99999999-9999-4999-8999-999999999999', primary_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${scanId}/99999999-9999-4999-8999-999999999999` }),
    ];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT quarantine_ref FROM file_security_scans')) return { rows: refs.slice(1).map((quarantine_ref) => ({ quarantine_ref })) };
      if (sql.includes('SELECT role, status FROM users')) return { rows: [{ role: 'security_admin', status: 'active' }] };
      if (sql.includes('FROM file_security_scans')) return { rows: scans };
      return { rows: [] };
    });
    const db = database(query);
    const tx = { query };
    const storage = {
      listQuarantineRefs: vi.fn(async () => refs),
      headByStorageUri: vi.fn(async (_tenant: string, uri: string) => (uri.endsWith(`/quarantine/${quarantineRef}`) || uri.includes('/documents/') ? null : { contentLength: 1 })),
    };
    const queue = { enqueue: vi.fn() };
    const promotion = { promote: vi.fn() };
    const service = new FileSecurityReconcilerService(audit(tx) as never, db as never, promotion, queue, {} as never, storage as never);

    await expect(service.reconcileTenant(tenantId)).resolves.toEqual({
      tenantId,
      inspectedCount: 7,
      inventoryTruncated: false,
      counts: {
        quarantine_object_without_row: 1,
        row_without_object: 1,
        clean_without_promotion: 1,
        primary_orphan: 1,
        stale_signature: 1,
      },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(promotion.promote).not.toHaveBeenCalled();
  });

  it('requires an active security admin and writes an audit before a retry queue request', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT role, status FROM users')) return { rows: [{ role: 'security_admin', status: 'active' }] };
      if (sql.includes('FROM file_security_scans')) return { rows: [row()] };
      return { rows: [] };
    });
    const db = database(query);
    const tx = { query };
    const audited = audit(tx);
    const queue = { enqueue: vi.fn(async () => 'job') };
    const service = new FileSecurityReconcilerService(
      audited as never,
      db as never,
      { promote: vi.fn() },
      queue,
      {} as never,
      { listQuarantineRefs: vi.fn(), headByStorageUri: vi.fn(async () => ({ contentLength: 1 })) } as never,
    );

    await expect(service.retry({ tenantId, actorUserId: scanId, scanId, reasonCode: 'SCANNER_RECOVERED' })).resolves.toEqual({ action: 'rescan' });
    expect(audited.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'FILE_SECURITY_RECONCILIATION_RETRY_REQUESTED',
      metadata: { hash: expectedSha256, reason_code: 'SCANNER_RECOVERED' },
    }), expect.anything());
    expect(queue.enqueue).toHaveBeenCalledWith({ tenantId, quarantineRef, expectedSha256 }, expect.anything());
  });

  it('fails closed for a non-admin, legal hold, and audit failure without enqueuing', async () => {
    const inactiveQuery = vi.fn(async (sql: string) => sql.includes('SELECT role, status FROM users')
      ? { rows: [{ role: 'matter_member', status: 'active' }] }
      : { rows: [row()] });
    const inactiveDb = database(inactiveQuery);
    const queue = { enqueue: vi.fn() };
    const denied = new FileSecurityReconcilerService(
      { transaction: vi.fn(), log: vi.fn() } as never,
      inactiveDb as never,
      { promote: vi.fn() },
      queue,
      {} as never,
      { listQuarantineRefs: vi.fn(), headByStorageUri: vi.fn() } as never,
    );
    await expect(denied.retry({ tenantId, actorUserId: scanId, scanId, reasonCode: 'MANUAL_REVIEW' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });

    const heldQuery = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT role, status FROM users')) return { rows: [{ role: 'firm_admin', status: 'active' }] };
      return { rows: [row({ legal_hold: true })] };
    });
    const held = new FileSecurityReconcilerService(
      { transaction: vi.fn(), log: vi.fn() } as never,
      database(heldQuery) as never,
      { promote: vi.fn() },
      queue,
      {} as never,
      { listQuarantineRefs: vi.fn(), headByStorageUri: vi.fn(async () => ({ contentLength: 1 })) } as never,
    );
    await expect(held.retry({ tenantId, actorUserId: scanId, scanId, reasonCode: 'MANUAL_REVIEW' })).rejects.toMatchObject({ response: { code: 'DOCUMENT_LOCKED' } });

    const failingQuery = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT role, status FROM users')) return { rows: [{ role: 'security_admin', status: 'active' }] };
      return { rows: [row()] };
    });
    const auditFailure = { transaction: vi.fn(async () => { throw new Error('audit unavailable'); }), log: vi.fn() };
    const auditBlocked = new FileSecurityReconcilerService(
      auditFailure as never,
      database(failingQuery) as never,
      { promote: vi.fn() },
      queue,
      {} as never,
      { listQuarantineRefs: vi.fn(), headByStorageUri: vi.fn(async () => ({ contentLength: 1 })) } as never,
    );
    await expect(auditBlocked.retry({ tenantId, actorUserId: scanId, scanId, reasonCode: 'MANUAL_REVIEW' })).rejects.toThrow('audit unavailable');
    expect(queue.enqueue).toHaveBeenCalledTimes(0);

    const crossTenant = new FileSecurityReconcilerService(
      { transaction: vi.fn(), log: vi.fn() } as never,
      database(failingQuery) as never,
      { promote: vi.fn() },
      queue,
      {} as never,
      { listQuarantineRefs: vi.fn(), headByStorageUri: vi.fn() } as never,
    );
    await expect(crossTenant.retry({ tenantId: otherTenantId, actorUserId: scanId, scanId, reasonCode: 'MANUAL_REVIEW' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('uses worker-only UTC scheduling and keeps its health result bounded', async () => {
    process.env.PROCESS_ROLE = 'worker';
    process.env.FILE_SECURITY_RECONCILIATION_WORKER_ENABLED = 'true';
    const boss = { schedule: vi.fn(async () => undefined), work: vi.fn(async () => 'worker') };
    const registry = { register: vi.fn(), consumer: vi.fn(async () => boss) };
    const service = new FileSecurityReconcilerService(
      {} as never,
      { listActiveTenantRegistryIds: vi.fn(async () => []) } as never,
      {} as never,
      {} as never,
      registry as never,
      {} as never,
    );
    await service.onModuleInit();
    expect(registry.consumer).toHaveBeenCalledWith(fileSecurityReconcileQueueName);
    expect(boss.schedule).toHaveBeenCalledWith(fileSecurityReconcileQueueName, '40 0 * * *', { scope: 'all-tenants' }, expect.objectContaining({ tz: 'UTC' }));
    expect(service.health()).toBeNull();
    expect(fileSecurityReconcileCron({ FILE_SECURITY_RECONCILIATION_CRON: '15 2 * * *' })).toBe('15 2 * * *');
    expect(isFileSecurityReconcilerWorkerEnabled({ PROCESS_ROLE: 'worker' })).toBe(true);
  });
});
