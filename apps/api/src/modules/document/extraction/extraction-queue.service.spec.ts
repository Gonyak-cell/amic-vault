import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeReference } from '../../../common/logging/logger';
import {
  extractionDeadLetterQueueName,
  extractionQueueName,
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import {
  ExtractionQueueService,
  extractionQueueSendOptions,
  isExtractionQueueWorkerEnabled,
} from './extraction-queue.service';
import { isOcrQueueWorkerEnabled, ocrQueueSendOptions } from './ocr-queue.service';
import { OcrQueueWorkerService } from './ocr-queue-worker.service';

describe('ExtractionQueueService options', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
  });

  it('logs only safe queue, version, and job references after transactional enqueue', async () => {
    const payload: ExtractionJobPayload = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      documentId: '11111111-1111-4111-8111-111111111133',
      versionId: '11111111-1111-4111-8111-111111111155',
      fileObjectId: '11111111-1111-4111-8111-111111111144',
    };
    const client = { query: vi.fn(async () => ({ rowCount: 1, rows: [] })) };
    const boss = {
      send: vi.fn(async () => '22222222-2222-4222-8222-222222222222'),
    };
    const queueRegistry = {
      register: vi.fn(),
      producer: vi.fn(async () => boss),
    };
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new ExtractionQueueService({} as never, queueRegistry as never);

    await expect(service.enqueueVersionCreated(payload, client as never)).resolves.toBe(
      '22222222-2222-4222-8222-222222222222',
    );

    expect(log).toHaveBeenCalledWith({
      code: 'EXTRACTION_ENQUEUED',
      queue: extractionQueueName,
      versionRef: safeReference(payload.versionId),
      jobRef: safeReference('22222222-2222-4222-8222-222222222222'),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(payload.versionId);
    expect(JSON.stringify(log.mock.calls)).not.toContain('22222222-2222-4222-8222-222222222222');
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
    process.env.PROCESS_ROLE = 'worker';
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
    const queueRegistry = { consumer: vi.fn(async () => boss) };
    const service = new OcrQueueWorkerService(dispatcher as never, queueRegistry as never);

    await service.onModuleInit();

    expect(boss.work).toHaveBeenCalledTimes(2);
    expect(queueRegistry.consumer).toHaveBeenCalledWith(ocrQueueName);
    await handlers.get(ocrQueueName)?.([{ data: payload }]);
    await handlers.get(ocrDeadLetterQueueName)?.([{ data: payload }]);

    expect(dispatcher.handleOcr).toHaveBeenCalledWith(payload);
    expect(dispatcher.markOcrDeadLetter).toHaveBeenCalledWith(payload);
  });
});
