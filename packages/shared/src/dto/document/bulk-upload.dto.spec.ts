import { describe, expect, it } from 'vitest';
import {
  bulkUploadBatchItemStatusSchema,
  bulkUploadJobSchema,
  registerBulkUploadBatchSchema,
} from './bulk-upload.dto';

function item(index: number) {
  return {
    itemId: `item-${index}`,
    fields: {},
    file: {
      path: `/tmp/item-${index}.pdf`,
      originalname: `item-${index}.pdf`,
      mimetype: 'application/pdf',
      size: 12,
    },
  };
}

describe('bulk upload dto schemas', () => {
  it('keeps queue jobs capped at 100 while batch sessions accept 5000 manifest items', () => {
    expect(() =>
      bulkUploadJobSchema.parse({
        batchId: '11111111-1111-4111-8111-111111111177',
        chunkIndex: 0,
        items: Array.from({ length: 101 }, (_, index) => ({
          ...item(index),
          tenantId: '11111111-1111-4111-8111-111111111111',
          tenantSlug: 'tenant-alpha',
          actorUserId: '11111111-1111-4111-8111-111111111101',
          matterId: '11111111-1111-4111-8111-111111111122',
        })),
      }),
    ).toThrow();

    expect(
      registerBulkUploadBatchSchema.parse({
        items: Array.from({ length: 5000 }, (_, index) => item(index)),
      }).items,
    ).toHaveLength(5000);
  });

  it('exposes duplicate as an explicit batch item status', () => {
    expect(bulkUploadBatchItemStatusSchema.parse('duplicate')).toBe('duplicate');
    expect(bulkUploadBatchItemStatusSchema.parse('quarantined')).toBe('quarantined');
  });
});
