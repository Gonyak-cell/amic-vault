import { describe, expect, it, vi } from 'vitest';
import type { BulkUploadJobDto, BulkUploadReportDto, TenantId } from '@amic-vault/shared';
import type { DatabaseService } from '../../common/db/database.service';
import { BulkUploadBatchService } from './bulk-upload-batch.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';
const batchId = '11111111-1111-4111-8111-111111111177';

function payload(): BulkUploadJobDto {
  return {
    batchId,
    chunkIndex: 0,
    items: [
      {
        itemId: 'late-item',
        tenantId,
        tenantSlug: 'tenant-alpha',
        actorUserId,
        matterId,
        fields: {},
        file: {
          path: '/tmp/late-item.pdf',
          originalname: 'late-item.pdf',
          mimetype: 'application/pdf',
          size: 7,
        },
      },
    ],
  };
}

describe('BulkUploadBatchService', () => {
  it('does not let a late success report overwrite USER_DEACTIVATED work', async () => {
    let status = 'failed';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE bulk_upload_batch_items')) {
        if (sql.includes("status IN ('pending', 'uploaded')") && status !== 'failed') {
          status = 'done';
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const database = {
      tenantTransaction: async (_tenantId: TenantId, run: (client: never) => Promise<unknown>) =>
        run({ query } as never),
    } as unknown as DatabaseService;
    const service = new BulkUploadBatchService(database);
    const report: BulkUploadReportDto = {
      queueName: 'document.bulk-upload',
      total: 1,
      succeeded: 1,
      failed: 0,
      items: [
        {
          itemId: 'late-item',
          status: 'success',
          document: {
            documentId: '11111111-1111-4111-8111-111111111133',
            matterId,
            fileObjectId: '11111111-1111-4111-8111-111111111144',
            status: 'draft',
            title: 'Late item',
            documentType: 'other',
            subtype: null,
            confidentialityLevel: 'standard',
            privilegeStatus: 'none',
            source: 'client_provided',
            aiAllowed: false,
            versionLabel: null,
            versionSignificance: 'internal_draft',
            renditionType: 'clean',
            metadataSuggestion: {},
            duplicates: [],
          },
        },
      ],
    };

    await service.recordJobReport(payload(), report);

    expect(status).toBe('failed');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'uploaded')"),
      expect.arrayContaining([tenantId, batchId, 'late-item']),
    );
  });

  it('does not enqueue new bulk authority after the lifecycle fence denies the actor', async () => {
    const query = vi.fn(async () => ({ rowCount: 0, rows: [] }));
    const database = {
      tenantTransaction: async (_tenantId: TenantId, run: (client: never) => Promise<unknown>) =>
        run({ query } as never),
    } as unknown as DatabaseService;
    const service = new BulkUploadBatchService(database);
    const enqueue = vi.fn(async () => 'job-id');

    await expect(
      service.registerBatch(
        {
          actorUserId,
          matterId,
          tenantId,
          tenantSlug: 'tenant-alpha',
          body: {
            items: [
              {
                itemId: 'blocked-item',
                fields: {},
                file: {
                  path: '/tmp/blocked-item.pdf',
                  originalname: 'blocked-item.pdf',
                  mimetype: 'application/pdf',
                  size: 7,
                },
              },
            ],
          },
        },
        enqueue,
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(enqueue).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'\n      FOR UPDATE"),
      [tenantId, actorUserId],
    );
  });
});
