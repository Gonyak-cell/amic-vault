import { describe, expect, it } from 'vitest';
import {
  createDocumentBulkActionBatchSchema,
  documentBulkActionJobSchema,
  retryDocumentBulkActionBatchSchema,
} from './bulk-action.dto';

const id = (index: number) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;

describe('document bulk action DTOs', () => {
  it('accepts one or 100 unique items and rejects 0, 101, and duplicates', () => {
    const input = {
      idempotencyKey: id(900),
      action: { kind: 'add_tag' as const, tag: 'reviewed' },
    };
    expect(
      createDocumentBulkActionBatchSchema.parse({ ...input, documentIds: [id(1)] }).documentIds,
    ).toHaveLength(1);
    expect(
      createDocumentBulkActionBatchSchema.parse({
        ...input,
        documentIds: Array.from({ length: 100 }, (_, index) => id(index + 1)),
      }).documentIds,
    ).toHaveLength(100);
    expect(() =>
      createDocumentBulkActionBatchSchema.parse({ ...input, documentIds: [] }),
    ).toThrow();
    expect(() =>
      createDocumentBulkActionBatchSchema.parse({
        ...input,
        documentIds: Array.from({ length: 101 }, (_, index) => id(index + 1)),
      }),
    ).toThrow();
    expect(() =>
      createDocumentBulkActionBatchSchema.parse({
        ...input,
        documentIds: [id(1), id(1)],
      }),
    ).toThrow();
  });

  it('allows only the four approved non-destructive action shapes', () => {
    const base = { idempotencyKey: id(900), documentIds: [id(1)] };
    expect(
      createDocumentBulkActionBatchSchema.parse({
        ...base,
        action: { kind: 'move_folder', folderId: id(300) },
      }).action,
    ).toEqual({ kind: 'move_folder', folderId: id(300) });
    expect(
      createDocumentBulkActionBatchSchema.parse({
        ...base,
        action: { kind: 'transition_status', status: 'final' },
      }).action,
    ).toEqual({ kind: 'transition_status', status: 'final' });
    expect(() =>
      createDocumentBulkActionBatchSchema.parse({
        ...base,
        action: { kind: 'transition_status', status: 'deleted' },
      }),
    ).toThrow();
    expect(() =>
      createDocumentBulkActionBatchSchema.parse({
        ...base,
        action: { kind: 'external_share', target: 'outside' },
      }),
    ).toThrow();
  });

  it('keeps jobs and retry selectors bounded and reference-only', () => {
    expect(
      documentBulkActionJobSchema.parse({
        batchId: id(1),
        tenantId: id(2),
        tenantSlug: 'tenant-alpha',
        actorUserId: id(3),
      }),
    ).toMatchObject({ batchId: id(1) });
    expect(retryDocumentBulkActionBatchSchema.parse({})).toEqual({});
    expect(() => retryDocumentBulkActionBatchSchema.parse({ itemIds: [id(1), id(1)] })).toThrow();
  });
});
