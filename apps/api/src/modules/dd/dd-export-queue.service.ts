import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job } from 'pg-boss';
import {
  ddExportJobResponseSchema,
  type CreateDdExportJobRequestDto,
  type DdExportJobResponseDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { currentProcessRole } from '../../common/process-role';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context';
import { TenantService } from '../tenant/tenant.service';
import {
  ddExportDeadLetterQueueName,
  ddExportQueueName,
  ddExportQueueSendOptions,
  ddExportQueueWorkOptions,
  isDdExportQueueWorkerEnabled,
  type DdExportJobPayload,
} from './dd-export-queue.types';
import { DdService } from './dd.service';

@Injectable()
export class DdExportQueueService implements OnModuleInit {
  private readonly logger = new Logger(DdExportQueueService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DdService) private readonly dd: DdService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.ensureQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isDdExportQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async enqueueFromRequest(
    ctx: PermissionContext,
    input: CreateDdExportJobRequestDto,
  ): Promise<DdExportJobResponseDto> {
    await this.dd.assertCanExportMatter(ctx, input.matterId);
    const payload: DdExportJobPayload = {
      tenantId: ctx.tenantId,
      matterId: input.matterId,
      userId: ctx.userId,
      authSessionId: ctx.sessionId ?? null,
      exportType: input.exportType,
      exportFormat: input.exportFormat,
      ...(input.exportType === 'negotiation_issues' && input.documentId
        ? { documentId: input.documentId }
        : {}),
      ...(input.exportType === 'negotiation_issues' && input.status
        ? { status: input.status }
        : {}),
    };
    const jobId = await this.auditService.transaction(ctx.tenantId, (client) =>
      this.enqueue(payload, client),
    );
    return ddExportJobResponseSchema.parse({
      jobId,
      queueName: ddExportQueueName,
      exportType: input.exportType,
      matterId: input.matterId,
    });
  }

  async enqueue(input: DdExportJobPayload, client: PoolClient): Promise<string> {
    this.ensureQueueDefinitions();
    const boss = await this.queueRegistry.producer(ddExportQueueName);
    const jobId = await boss.send(ddExportQueueName, input, ddExportQueueSendOptions(input, client));
    if (!jobId) throw new Error('DD export job enqueue returned no id');
    return jobId;
  }

  async handle(input: DdExportJobPayload): Promise<void> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) throw new Error('DD export tenant not found');
    const ctx: PermissionContext = {
      tenantId: input.tenantId,
      userId: input.userId,
      ...(input.authSessionId ? { sessionId: input.authSessionId } : {}),
    };
    await this.tenantContext.run(
      {
        tenantId: tenant.tenantId,
        slug: tenant.slug,
        status: tenant.status,
        source: 'session',
      },
      async () => {
        if (input.exportType === 'dd_report') {
          await this.dd.exportReport(ctx, {
            matterId: input.matterId,
            exportFormat: input.exportFormat,
          });
          return;
        }
        await this.dd.exportNegotiationIssues(ctx, {
          matterId: input.matterId,
          exportFormat: input.exportFormat,
          ...(input.documentId ? { documentId: input.documentId } : {}),
          ...(input.status ? { status: input.status } : {}),
        });
      },
    );
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(ddExportQueueName);
    await boss.work<DdExportJobPayload>(
      ddExportQueueName,
      ddExportQueueWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleQueuedJob(job)));
      },
    );
    await boss.work<DdExportJobPayload>(
      ddExportDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'DD_EXPORT_DEAD_LETTER',
          matterId: job.data.matterId,
          documentId: job.data.documentId ?? null,
          exportType: job.data.exportType,
          deadLetterId: String(job.id),
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleQueuedJob(job: Job<DdExportJobPayload>): Promise<void> {
    try {
      await this.handle(job.data);
    } catch (error) {
      this.logger.warn({
        code: 'DD_EXPORT_WORKER_EXCEPTION',
        matterId: job.data.matterId,
        documentId: job.data.documentId ?? null,
        exportType: job.data.exportType,
        message: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  private ensureQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: ddExportDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: ddExportQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 1,
        retryBackoff: true,
        deadLetter: ddExportDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }
}
