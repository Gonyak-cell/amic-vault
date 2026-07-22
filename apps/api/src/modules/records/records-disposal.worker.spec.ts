import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  StorageAccessDeniedError,
  StorageRequestTimeoutError,
  StorageUnavailableError,
  StorageVersionFingerprintUnavailableError,
} from '../storage/storage-adapter.interface';
import { sealedDisposalInventoryHash, type SealedDisposalInventoryEntry } from './disposal-receipt.types';
import {
  classifyRecordsDisposalFailure,
  isRecordsDisposalWorkerEnabled,
  recordsDisposalQueueName,
  RecordsDisposalWorker,
} from './records-disposal.worker';

const tenantId = '11111111-1111-4111-8111-111111111111';
const outboxId = '11111111-1111-4111-8111-111111111122';
const claimToken = '11111111-1111-4111-8111-111111111133';
const requestId = '11111111-1111-4111-8111-111111111144';
const matterId = '11111111-1111-4111-8111-111111111155';
const documentId = '11111111-1111-4111-8111-111111111166';
const firstInventoryId = '11111111-1111-4111-8111-111111111177';
const secondInventoryId = '11111111-1111-4111-8111-111111111188';
const storageUri = `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${firstInventoryId}`;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function row(inventoryId: string, ordinal: number) {
  return {
    disposal_inventory_id: inventoryId,
    document_id: documentId,
    document_version_id: inventoryId,
    file_object_id: inventoryId,
    object_kind: 'document_version' as const,
    storage_key_hash: hash(storageUri),
    storage_version_fingerprint: ordinal === 1 ? 'a'.repeat(64) : 'b'.repeat(64),
    content_sha256: ordinal === 1 ? 'c'.repeat(64) : 'd'.repeat(64),
    canonical_ordinal: ordinal,
    storage_uri: storageUri,
  };
}

function createHarness(input: {
  rows?: ReturnType<typeof row>[];
  inspect?: ReturnType<typeof vi.fn>;
  holdOnEntry?: boolean;
  claimCount?: number;
} = {}) {
  const inventory = input.rows ?? [row(firstInventoryId, 1)];
  const sealedEntries: SealedDisposalInventoryEntry[] = inventory.map((entry) => ({
    documentId: entry.document_id,
    documentVersionId: entry.document_version_id,
    fileObjectId: entry.file_object_id,
    objectKind: entry.object_kind,
    storageKeyHash: entry.storage_key_hash,
    storageVersionFingerprint: entry.storage_version_fingerprint,
    contentSha256: entry.content_sha256,
    canonicalOrdinal: entry.canonical_ordinal,
  }));
  const receipts = new Map<string, 'deleted' | 'already_absent'>();
  let claimsRemaining = input.claimCount ?? 1;
  let targetReads = 0;
  const terminalUpdates: unknown[][] = [];
  const client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql.includes('SET state = \'pending\'')) return { rowCount: 0, rows: [] };
      if (sql.includes('WITH selected AS')) {
        if (claimsRemaining === 0) return { rowCount: 0, rows: [] };
        claimsRemaining -= 1;
        return { rowCount: 1, rows: [{ disposalOutboxId: outboxId, claimToken }] };
      }
      if (sql.includes('FROM records_disposal_outbox outbox') && sql.includes('FOR UPDATE OF')) {
        targetReads += 1;
        return {
          rowCount: 1,
          rows: [{
            disposal_outbox_id: outboxId,
            disposal_request_id: requestId,
            inventory_hash: sealedDisposalInventoryHash(sealedEntries),
            document_id: documentId,
            matter_id: matterId,
            request_status: 'approved',
            approved_by: '11111111-1111-4111-8111-111111111199',
            document_legal_hold: input.holdOnEntry === true && targetReads > 1,
            matter_legal_hold: false,
          }],
        };
      }
      if (sql.includes('FROM legal_holds')) return { rowCount: 1, rows: [{ count: '0' }] };
      if (sql.includes('FROM records_disposal_inventory inventory')) {
        return {
          rowCount: inventory.length,
          rows: inventory.map((entry) => ({ ...entry, receipt_outcome: receipts.get(entry.disposal_inventory_id) ?? null })),
        };
      }
      if (sql.includes('INSERT INTO records_disposal_receipts')) {
        const inventoryId = params[2] as string;
        receipts.set(inventoryId, params[3] as 'deleted' | 'already_absent');
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT count(*)::text AS count') && sql.includes('records_disposal_receipts')) {
        return { rowCount: 1, rows: [{ count: String(receipts.size) }] };
      }
      if (sql.includes("SET state = 'completed'")) return { rowCount: 1, rows: [] };
      if (sql.includes('SET state = $4')) {
        terminalUpdates.push([...params]);
        return {
          rowCount: 1,
          rows: [{ inventory_hash: sealedDisposalInventoryHash(sealedEntries), disposal_request_id: requestId, matter_id: matterId, document_id: documentId }],
        };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const audit = {
    transaction: vi.fn(async (_tenant: string, run: (tx: typeof client) => Promise<unknown>) => run(client)),
    log: vi.fn(async () => ({ eventId: '11111111-1111-4111-8111-111111111200' })),
  };
  const storage = {
    inspectSealedVersionByStorageUri: input.inspect ?? vi.fn(async () => ({ version: {} as never, present: true, objectLockProtected: false })),
    deleteSealedVersion: vi.fn(async () => undefined),
    sealedVersionIsPresent: vi.fn(async () => false),
  };
  const queue = { register: vi.fn(), consumer: vi.fn() };
  const worker = new RecordsDisposalWorker(
    audit as never,
    storage as never,
    { listActiveTenantIds: vi.fn(async () => [tenantId]) } as never,
    queue as never,
  );
  return { audit, client, queue, receipts, storage, terminalUpdates, worker };
}

describe('RecordsDisposalWorker', () => {
  it('is disabled in the API role and registers its queue without starting a consumer', async () => {
    const { queue, worker } = createHarness();
    const original = process.env.PROCESS_ROLE;
    process.env.PROCESS_ROLE = 'api';
    try {
      await worker.onModuleInit();
    } finally {
      if (original === undefined) delete process.env.PROCESS_ROLE;
      else process.env.PROCESS_ROLE = original;
    }
    expect(isRecordsDisposalWorkerEnabled({ PROCESS_ROLE: 'api' })).toBe(false);
    expect(queue.register).toHaveBeenCalledWith(expect.objectContaining({ name: recordsDisposalQueueName }));
    expect(queue.consumer).not.toHaveBeenCalled();
  });

  it('claims with SKIP LOCKED, exact-deletes, readbacks, receipts, and completes', async () => {
    const { audit, client, receipts, storage, worker } = createHarness();
    await expect(worker.runOnceForTenant(tenantId)).resolves.toEqual({
      claimedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      deadLetterCount: 0,
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE SKIP LOCKED'), [tenantId, 25]);
    expect(storage.deleteSealedVersion).toHaveBeenCalledTimes(1);
    expect(storage.sealedVersionIsPresent).toHaveBeenCalledTimes(1);
    expect(receipts.get(firstInventoryId)).toBe('deleted');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DISPOSAL_EXECUTED' }), client);
  });

  it('records exact HEAD absence only as already_absent', async () => {
    const inspect = vi.fn(async () => ({ version: {} as never, present: false, objectLockProtected: false }));
    const { receipts, storage, worker } = createHarness({ inspect });
    await worker.runOnceForTenant(tenantId);
    expect(receipts.get(firstInventoryId)).toBe('already_absent');
    expect(storage.deleteSealedVersion).not.toHaveBeenCalled();
  });

  it('blocks Object Lock immediately before deletion', async () => {
    const inspect = vi.fn(async () => ({ version: {} as never, present: true, objectLockProtected: true }));
    const { storage, terminalUpdates, worker } = createHarness({ inspect });
    await worker.runOnceForTenant(tenantId);
    expect(storage.deleteSealedVersion).not.toHaveBeenCalled();
    expect(terminalUpdates[0]?.slice(3, 5)).toEqual(['blocked', 'object_lock']);
  });

  it('commits the first receipt before a later timeout and terminalizes without replay', async () => {
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({ version: {} as never, present: true, objectLockProtected: false })
      .mockRejectedValueOnce(new StorageRequestTimeoutError());
    const { receipts, terminalUpdates, worker } = createHarness({
      rows: [row(firstInventoryId, 1), row(secondInventoryId, 2)],
      inspect,
    });
    await expect(worker.runOnceForTenant(tenantId)).resolves.toMatchObject({
      completedCount: 0,
      deadLetterCount: 1,
    });
    expect(receipts.get(firstInventoryId)).toBe('deleted');
    expect(terminalUpdates[0]?.slice(3, 5)).toEqual(['dead_letter', 'storage_timeout']);
  });

  it('blocks a hold activated after approval before the exact delete', async () => {
    const { storage, terminalUpdates, worker } = createHarness({ holdOnEntry: true });
    await worker.runOnceForTenant(tenantId);
    expect(storage.deleteSealedVersion).not.toHaveBeenCalled();
    expect(terminalUpdates[0]?.slice(3, 5)).toEqual(['blocked', 'hold_activated']);
  });

  it('does not duplicate completed work across ten sequential worker runs', async () => {
    const { receipts, storage, worker } = createHarness({ claimCount: 1 });
    for (let count = 0; count < 10; count += 1) await worker.runOnceForTenant(tenantId);
    expect(storage.deleteSealedVersion).toHaveBeenCalledTimes(1);
    expect(receipts.size).toBe(1);
  });

  it.each([
    [new StorageVersionFingerprintUnavailableError(), 'blocked', 'version_unavailable'],
    [new StorageAccessDeniedError(), 'dead_letter', 'storage_forbidden'],
    [new StorageRequestTimeoutError(), 'dead_letter', 'storage_timeout'],
    [new StorageUnavailableError(), 'dead_letter', 'storage_unavailable'],
  ])('never classifies %p as successful', (error, state, code) => {
    expect(classifyRecordsDisposalFailure(error)).toMatchObject({ state, code });
  });
});
