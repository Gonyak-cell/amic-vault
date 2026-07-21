import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractionDeadLetterQueueName,
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import {
  extractionQueueSendOptions,
  isExtractionQueueWorkerEnabled,
} from './extraction-queue.service';
import { isOcrQueueWorkerEnabled, ocrQueueSendOptions } from './ocr-queue.service';
import { OcrQueueWorkerService } from './ocr-queue-worker.service';

describe('ExtractionQueueService options', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('uses max three retries, exponential backoff, and dead letter queue', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'queued' }] })),
    };
    const options = extractionQueueSendOptions('version-id', client as never);

    expect(options).toMatchObject({
      singletonKey: 'version-id',
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: extractionDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'queued' }],
    });
  });

  it('uses PROCESS_ROLE as the default worker activation contract', () => {
    delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isExtractionQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isExtractionQueueWorkerEnabled()).toBe(false);

    delete process.env.PROCESS_ROLE;
    expect(isExtractionQueueWorkerEnabled()).toBe(false);
  });

  it('keeps the legacy extraction worker flag as an explicit override', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = 'true';
    expect(isExtractionQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'worker';
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = 'false';
    expect(isExtractionQueueWorkerEnabled()).toBe(false);
  });

  it('uses bounded OCR queue retry options with transactional pg-boss sends', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'ocr-queued' }] })),
    };
    const options = ocrQueueSendOptions('version-id', client as never);

    expect(options).toMatchObject({
      singletonKey: 'version-id',
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      deadLetter: ocrDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'ocr-queued' }],
    });
  });

  it('keeps the OCR worker flag separate from the extraction worker flag', () => {
    process.env.PROCESS_ROLE = 'worker';
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = 'true';
    process.env.OCR_QUEUE_WORKER_ENABLED = 'false';
    expect(isExtractionQueueWorkerEnabled()).toBe(true);
    expect(isOcrQueueWorkerEnabled()).toBe(false);

    process.env.PROCESS_ROLE = 'api';
    process.env.EXTRACTION_QUEUE_WORKER_ENABLED = 'false';
    process.env.OCR_QUEUE_WORKER_ENABLED = 'true';
    expect(isExtractionQueueWorkerEnabled()).toBe(false);
    expect(isOcrQueueWorkerEnabled()).toBe(true);
  });

  it('routes OCR queue jobs and dead letters to the OCR dispatcher path', async () => {
    process.env.OCR_QUEUE_WORKER_ENABLED = 'true';
    const payload: ExtractionJobPayload = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      documentId: '11111111-1111-4111-8111-111111111133',
      versionId: '11111111-1111-4111-8111-111111111155',
      fileObjectId: '11111111-1111-4111-8111-111111111144',
    };
    const handlers = new Map<
      string,
      (jobs: Array<{ data: ExtractionJobPayload }>) => Promise<void>
    >();
    const boss = {
      work: vi.fn(
        async (
          queueName: string,
          _options: unknown,
          handler: (jobs: Array<{ data: ExtractionJobPayload }>) => Promise<void>,
        ) => {
          handlers.set(queueName, handler);
        },
      ),
      stop: vi.fn(async () => undefined),
    };
    const dispatcher = {
      handleOcr: vi.fn(async () => undefined),
      markOcrDeadLetter: vi.fn(async () => undefined),
    };
    const service = new OcrQueueWorkerService(dispatcher as never);
    (
      service as unknown as {
        ensureStarted: () => Promise<typeof boss>;
      }
    ).ensureStarted = async () => boss;

    await service.onModuleInit();

    expect(boss.work).toHaveBeenCalledTimes(2);
    await handlers.get(ocrQueueName)?.([{ data: payload }]);
    await handlers.get(ocrDeadLetterQueueName)?.([{ data: payload }]);

    expect(dispatcher.handleOcr).toHaveBeenCalledWith(payload);
    expect(dispatcher.markOcrDeadLetter).toHaveBeenCalledWith(payload);
  });
});
