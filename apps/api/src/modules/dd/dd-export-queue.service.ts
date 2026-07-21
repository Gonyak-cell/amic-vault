import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, PgBoss } from 'pg-boss';
import {
  ddExportJobResponseSchema,
  type CreateDdExportJobRequestDto,
  type DdExportJobResponseDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
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

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

@Injectable()
export class DdExportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DdExportQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DdService) private readonly dd: DdService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isDdExportQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
    const boss = await this.ensureStarted();
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
    const boss = await this.ensureStarted();
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

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= this.createStartedBoss();
    this.boss = await this.startPromise;
    return this.boss;
  }

  private async createStartedBoss(): Promise<PgBoss> {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: databaseUrl,
      ...pgBossRuntimeOptions({
        applicationName: 'amic-vault-dd-export-queue',
        migrateEnvName: 'DD_EXPORT_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'DD_EXPORT_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'DD_EXPORT_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'DD_EXPORT_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(ddExportDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(ddExportQueueName, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: ddExportDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }
}
