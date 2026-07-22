import { Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { SendOptions } from 'pg-boss';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';
import { FileSecurityService } from './file-security.service';
import { fileSecurityScanDeadLetterQueueName, fileSecurityScanQueueName, type FileSecurityScanJobPayload } from './file-security.types';

export function fileSecurityScanSendOptions(payload: FileSecurityScanJobPayload, client: PoolClient): SendOptions {
  return { singletonKey: payload.quarantineRef, retryLimit: 3, retryDelay: 5, retryBackoff: true, deadLetter: fileSecurityScanDeadLetterQueueName, db: pgBossDbFromPoolClient(client) };
}

@Injectable()
export class FileScanQueueService implements OnModuleInit {
  private registered = false;
  private workerRegistered = false;
  constructor(private readonly fileSecurityService: FileSecurityService, private readonly queueRegistry: QueueRegistry) {}

  async onModuleInit(): Promise<void> {
    this.registerQueues();
    if (currentProcessRole() === 'worker' && queueWorkerEnabled('FILE_SECURITY_SCAN_WORKER_ENABLED')) await this.registerWorker();
  }

  async enqueue(payload: FileSecurityScanJobPayload, client: PoolClient): Promise<string> {
    const boss = await this.queueRegistry.producer(fileSecurityScanQueueName);
    const jobId = await boss.send(fileSecurityScanQueueName, payload, fileSecurityScanSendOptions(payload, client));
    if (!jobId) throw new Error('file security scan enqueue returned no id');
    return jobId;
  }

  private registerQueues(): void {
    if (this.registered) return;
    this.queueRegistry.register({ name: fileSecurityScanDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: fileSecurityScanQueueName, options: { retryLimit: 3, retryDelay: 5, retryBackoff: true, deadLetter: fileSecurityScanDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.registered = true;
  }

  private async registerWorker(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(fileSecurityScanQueueName);
    await boss.work<FileSecurityScanJobPayload>(fileSecurityScanQueueName, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => { if (job) await this.fileSecurityService.handle(job.data); });
    this.workerRegistered = true;
  }
}
