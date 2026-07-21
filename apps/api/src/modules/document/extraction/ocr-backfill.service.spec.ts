import { describe, expect, it, vi } from 'vitest';
import { OcrBackfillService } from './ocr-backfill.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const versionId = '11111111-1111-4111-8111-111111111144';
const fileObjectId = '11111111-1111-4111-8111-111111111155';

describe('OcrBackfillService', () => {
  it('requeues current ocr_pending documents with count-only audit metadata', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ matter_id: matterId }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              document_id: documentId,
              version_id: versionId,
              file_object_id: fileObjectId,
            },
          ],
        }),
    };
    const auditLog = vi.fn(async () => undefined);
    const enqueueOcrRequired = vi.fn(async () => 'ocr-job-1');
    const service = new OcrBackfillService(
      {
        transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
        ),
        log: auditLog,
      } as never,
      { enqueueOcrRequired } as never,
      { require: () => ({ tenantId, userId: actorUserId }) } as never,
    );

    await expect(
      service.requestBackfill(actorUserId, { scopeType: 'matter', scopeId: matterId }),
    ).resolves.toEqual({
      accepted: true,
      scopeType: 'matter',
      scopeId: matterId,
      enqueuedJobCount: 1,
    });

    expect(String(tx.query.mock.calls[1]?.[0])).toContain("cd.extraction_status = 'ocr_pending'");
    expect(String(tx.query.mock.calls[1]?.[0])).toContain("cd.extraction_method = 'ocr_required'");
    expect(String(tx.query.mock.calls[1]?.[0])).toContain("dv.version_status = 'current'");
    expect(enqueueOcrRequired).toHaveBeenCalledWith(
      { tenantId, documentId, versionId, fileObjectId },
      tx,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_REINDEX_REQUESTED',
        metadata: {
          scope_type: 'ocr_backfill_matter',
          scope_id: matterId,
          enqueued_job_count: 1,
        },
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toMatch(/body|snippet|raw|filename/i);
  });
});
