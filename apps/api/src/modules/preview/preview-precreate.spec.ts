import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { previewConvertQueueName } from './preview-convert.job';
import {
  isPreviewConvertQueueWorkerEnabled,
  previewConvertDeadLetterQueueName,
  previewConvertQueueSendOptions,
  PreviewPrecreateQueueService,
  type PreviewPrecreateJobPayload,
} from './preview-precreate-queue.service';
import { PreviewService } from './preview.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const documentId = '11111111-1111-4111-8111-111111111133';
const versionId = '11111111-1111-4111-8111-111111111155';
const fileObjectId = '11111111-1111-4111-8111-111111111144';
const actorUserId = '11111111-1111-4111-8111-111111111101';

const payload: PreviewPrecreateJobPayload = {
  tenantId,
  documentId,
  versionId,
  fileObjectId,
  actorUserId,
};

describe('PreviewPrecreateQueueService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('uses bounded retries, exponential backoff, and a dead letter queue', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'preview-queued' }] })),
    };
    const options = previewConvertQueueSendOptions(payload, client as never);

    expect(options).toMatchObject({
      singletonKey: versionId,
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: previewConvertDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'preview-queued' }],
    });
  });

  it('uses PROCESS_ROLE as the default worker activation contract', () => {
    delete process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);

    delete process.env.PROCESS_ROLE;
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);
  });

  it('keeps the preview worker flag as an explicit override', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'true';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'worker';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'false';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);
  });

  it('enqueues only Office preview conversion jobs after upload commit', async () => {
    const client = {
      query: vi.fn(async () => ({
        rowCount: 1,
        rows: [
          {
            mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
        ],
      })),
    };
    const boss = {
      send: vi.fn(async () => 'preview-job-id'),
      stop: vi.fn(async () => undefined),
    };
    const service = new PreviewPrecreateQueueService({
      precreatePreview: vi.fn(),
      markPrecreateFailed: vi.fn(),
    } as never);
    (
      service as unknown as {
        ensureStarted: () => Promise<typeof boss>;
      }
    ).ensureStarted = async () => boss;

    await expect(service.enqueueVersionCreated(payload, client as never)).resolves.toBe(
      'preview-job-id',
    );
    expect(boss.send).toHaveBeenCalledWith(
      previewConvertQueueName,
      payload,
      expect.objectContaining({
        singletonKey: versionId,
        retryLimit: 3,
        deadLetter: previewConvertDeadLetterQueueName,
      }),
    );

    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ mime_type: 'application/pdf' }],
    });
    await expect(service.enqueueVersionCreated(payload, client as never)).resolves.toBeNull();
    expect(boss.send).toHaveBeenCalledTimes(1);
  });

  it('routes worker jobs to precreate and dead letters to failed status marking', async () => {
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'true';
    const handlers = new Map<
      string,
      (jobs: Array<{ data: PreviewPrecreateJobPayload }>) => Promise<void>
    >();
    const boss = {
      work: vi.fn(
        async (
          queueName: string,
          _options: unknown,
          handler: (jobs: Array<{ data: PreviewPrecreateJobPayload }>) => Promise<void>,
        ) => {
          handlers.set(queueName, handler);
        },
      ),
      stop: vi.fn(async () => undefined),
    };
    const previewService = {
      precreatePreview: vi.fn(async () => 'ready' as const),
      markPrecreateFailed: vi.fn(async () => undefined),
    };
    const service = new PreviewPrecreateQueueService(previewService as never);
    (
      service as unknown as {
        ensureStarted: () => Promise<typeof boss>;
      }
    ).ensureStarted = async () => boss;

    await service.onModuleInit();

    expect(boss.work).toHaveBeenCalledTimes(2);
    await handlers.get(previewConvertQueueName)?.([{ data: payload }]);
    await handlers.get(previewConvertDeadLetterQueueName)?.([{ data: payload }]);

    expect(previewService.precreatePreview).toHaveBeenCalledWith(payload);
    expect(previewService.markPrecreateFailed).toHaveBeenCalledWith(payload);
  });

  it('records failed preview precreation without overwriting ready artifacts', async () => {
    const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => {
      void _sql;
      void _params;
      return {
        rowCount: 1,
        rows: [],
      };
    });
    const tx = {
      query,
    };
    const transaction = vi.fn(
      async (_tenantId: TenantId, callback: (client: typeof tx) => Promise<void>) =>
        callback(tx),
    );
    const service = new PreviewService(
      { transaction } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.markPrecreateFailed(payload);

    const sql = String(tx.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("failure_reason_code = EXCLUDED.failure_reason_code");
    expect(sql).toContain("WHERE document_preview_artifacts.status <> 'ready'");
    expect(tx.query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      documentId,
      versionId,
      fileObjectId,
      'PREVIEW_CONVERSION_UNAVAILABLE',
    ]);
  });
});
