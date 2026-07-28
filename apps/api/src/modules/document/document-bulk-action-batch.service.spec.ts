import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import {
  DocumentBulkActionBatchService,
  documentBulkActionRequestHash,
} from './document-bulk-action-batch.service';

const tenantId = '11111111-1111-4111-8111-111111111103' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const idempotencyKey = '11111111-1111-4111-8111-111111111901';
const documentId = '11111111-1111-4111-8111-111111111301';

describe('DocumentBulkActionBatchService contracts', () => {
  it('hashes the exact ordered document set and action without storing document content', () => {
    const one = documentBulkActionRequestHash({
      action: { kind: 'add_tag', tag: 'reviewed' },
      documentIds: [documentId],
    });
    const replay = documentBulkActionRequestHash({
      action: { kind: 'add_tag', tag: 'reviewed' },
      documentIds: [documentId],
    });
    const changed = documentBulkActionRequestHash({
      action: { kind: 'remove_tag', tag: 'reviewed' },
      documentIds: [documentId],
    });

    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(replay).toBe(one);
    expect(changed).not.toBe(one);
  });

  it('rejects invalid bounds before opening a tenant transaction or enqueueing work', async () => {
    const auditService = {
      transaction: vi.fn(),
    };
    const service = new DocumentBulkActionBatchService(
      auditService as never,
      { scopeForSearch: vi.fn() } as never,
    );
    const enqueue = vi.fn(async () => 'job-id');
    const base = {
      actorUserId,
      tenantId,
      tenantSlug: 'tenant-alpha',
    };

    await expect(
      service.createBatch(
        {
          ...base,
          body: {
            action: { kind: 'add_tag', tag: 'reviewed' },
            documentIds: [],
            idempotencyKey,
          },
        },
        enqueue,
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await expect(
      service.createBatch(
        {
          ...base,
          body: {
            action: { kind: 'add_tag', tag: 'reviewed' },
            documentIds: Array.from(
              { length: 101 },
              (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
            ),
            idempotencyKey,
          },
        },
        enqueue,
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });

    expect(auditService.transaction).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
