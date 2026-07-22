import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import {
  dlpBehaviorAlertListResponseSchema,
  dlpBehaviorAlertSchema,
  type DlpBehaviorAlertDto,
  type DlpBehaviorAlertListResponseDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { AuditService, type QueryClient } from '../audit/audit.service';

const defaultThresholdCount = 50;
const defaultThresholdBytes = 500 * 1024 * 1024;
const defaultWindowMinutes = 60;

export const bulkDownloadMonitorQueueName = 'dlp.bulk-download.monitor';
export const bulkDownloadMonitorDeadLetterQueueName = 'dlp.bulk-download.monitor.dead';
export const bulkDownloadMonitorScheduleKey = 'every-five-minutes';

interface BulkDownloadThresholds {
  thresholdBytes: number;
  thresholdCount: number;
  windowMinutes: number;
}

interface TenantSettingsRow {
  settings_json: unknown;
}

interface BulkDownloadCandidateRow {
  actor_user_id: string;
  matter_id: string;
  event_count: number;
  total_bytes: string | number;
  first_download_at: Date;
  last_download_at: Date;
}

interface InsertAlertRow {
  alert_id: string;
}

interface DlpBehaviorAlertRow {
  alert_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_safe_label: string;
  actor_display_email: string | null;
  matter_id: string;
  window_start: Date;
  window_end: Date;
  event_count: number;
  total_bytes: string | number;
  threshold_count: number;
  threshold_bytes: string | number;
  status: 'open' | 'acknowledged' | 'dismissed';
  created_at: Date;
}

export interface BulkDownloadMonitorJobPayload {
  asOf?: string;
  scope?: 'bulk-download';
}

export interface BulkDownloadMonitorJobResult {
  alertCount: number;
  reviewedTenantCount: number;
  tenantCount: number;
}

@Injectable()
export class BulkDownloadMonitorTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.databaseService.listActiveTenantRegistryIds();
  }
}

@Injectable()
export class BulkDownloadMonitorService implements OnModuleInit {
  private readonly logger = new Logger(BulkDownloadMonitorService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(BulkDownloadMonitorTenantReader)
    private readonly tenantReader: Pick<BulkDownloadMonitorTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isBulkDownloadMonitorWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async sweepBulkDownloadAlerts(
    input: {
      asOf?: Date;
      tenantIds?: readonly string[];
    } = {},
  ): Promise<BulkDownloadMonitorJobResult> {
    const tenantIds = [...(input.tenantIds ?? (await this.tenantReader.listActiveTenantIds()))];
    const asOf = input.asOf ?? new Date();
    let alertCount = 0;
    let reviewedTenantCount = 0;
    const failedTenantIds: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        alertCount += await this.sweepBulkDownloadAlertsForTenant(tenantId, asOf);
        reviewedTenantCount += 1;
      } catch {
        failedTenantIds.push(tenantId);
      }
    }

    if (failedTenantIds.length > 0) {
      this.logger.warn({
        code: 'DLP_BULK_DOWNLOAD_MONITOR_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failedTenantIds.length,
      });
      throw new Error(`bulk download monitor failed for ${failedTenantIds.length} tenant(s)`);
    }

    return { alertCount, reviewedTenantCount, tenantCount: tenantIds.length };
  }

  async listBehaviorAlerts(ctx: PermissionContext): Promise<DlpBehaviorAlertListResponseDto> {
    const rows = await this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query(
        `
          SELECT
            dba.alert_id::text AS alert_id,
            dba.tenant_id::text AS tenant_id,
            dba.actor_user_id::text AS actor_user_id,
            coalesce(nullif(u.name, ''), u.email, dba.actor_user_id::text) AS actor_safe_label,
            u.email AS actor_display_email,
            dba.matter_id::text AS matter_id,
            dba.window_start,
            dba.window_end,
            dba.event_count,
            dba.total_bytes,
            dba.threshold_count,
            dba.threshold_bytes,
            dba.status,
            dba.created_at
          FROM dlp_behavior_alerts dba
          LEFT JOIN users u
            ON u.tenant_id = dba.tenant_id
           AND u.user_id = dba.actor_user_id
          WHERE dba.tenant_id = $1
          ORDER BY dba.created_at DESC, dba.alert_id DESC
          LIMIT 20
        `,
        [ctx.tenantId],
      );
      return result.rows as DlpBehaviorAlertRow[];
    });

    return dlpBehaviorAlertListResponseSchema.parse({
      items: rows.map(mapDlpBehaviorAlert),
    });
  }

  private async sweepBulkDownloadAlertsForTenant(tenantId: string, asOf: Date): Promise<number> {
    return this.auditService.transaction(tenantId, async (client) => {
      const thresholds = await this.readThresholds(client, tenantId);
      const windowEnd = asOf;
      const windowStart = new Date(windowEnd.getTime() - thresholds.windowMinutes * 60_000);
      const candidates = await this.findBulkDownloadCandidates(
        client,
        tenantId,
        windowStart,
        windowEnd,
        thresholds,
      );
      let alertCount = 0;

      for (const candidate of candidates) {
        const alertId = await this.insertAlert(client, tenantId, candidate, thresholds, {
          windowEnd,
          windowStart,
        });
        if (!alertId) continue;
        const audit = await this.auditService.log(
          {
            tenantId,
            actorType: 'system',
            actorId: null,
            action: 'DLP_BULK_DOWNLOAD_DETECTED',
            targetType: 'dlp_behavior_alert',
            targetId: alertId,
            matterId: candidate.matter_id,
            metadata: {
              dlp_alert_id: alertId,
              target_user_id: candidate.actor_user_id,
              matter_id: candidate.matter_id,
              event_count: candidate.event_count,
              download_byte_count: Number(candidate.total_bytes),
              threshold_event_count: thresholds.thresholdCount,
              threshold_byte_count: thresholds.thresholdBytes,
              window_start: windowStart.toISOString(),
              window_end: windowEnd.toISOString(),
              reason_code: 'DLP_BULK_DOWNLOAD_THRESHOLD',
            },
          },
          client,
        );
        await this.attachAuditAndNotify(client, tenantId, alertId, candidate, audit.eventId);
        alertCount += 1;
      }

      return alertCount;
    });
  }

  private async readThresholds(
    client: QueryClient,
    tenantId: string,
  ): Promise<BulkDownloadThresholds> {
    const result = await client.query(
      `
        SELECT settings_json
        FROM tenants
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );
    const [row] = result.rows as TenantSettingsRow[];
    return resolveBulkDownloadThresholds(row?.settings_json);
  }

  private async findBulkDownloadCandidates(
    client: QueryClient,
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
    thresholds: BulkDownloadThresholds,
  ): Promise<BulkDownloadCandidateRow[]> {
    const result = await client.query(
      `
        SELECT
          ae.actor_id::text AS actor_user_id,
          (array_agg(ae.matter_id ORDER BY ae.created_at DESC, ae.event_id DESC))[1]::text AS matter_id,
          count(*)::int AS event_count,
          coalesce(sum(coalesce(fo.size_bytes, 0)), 0)::bigint AS total_bytes,
          min(ae.created_at) AS first_download_at,
          max(ae.created_at) AS last_download_at
        FROM audit_events ae
        LEFT JOIN document_versions dv
          ON dv.tenant_id = ae.tenant_id
         AND dv.version_id::text = ae.metadata_json->>'version_id'
        LEFT JOIN file_objects fo
          ON fo.tenant_id = dv.tenant_id
         AND fo.file_object_id = dv.file_object_id
        WHERE ae.tenant_id = $1
          AND ae.action = 'DOCUMENT_DOWNLOADED'
          AND ae.actor_id IS NOT NULL
          AND ae.matter_id IS NOT NULL
          AND ae.created_at >= $2::timestamptz
          AND ae.created_at < $3::timestamptz
        GROUP BY ae.actor_id
        HAVING count(*) > $4::int
            OR coalesce(sum(coalesce(fo.size_bytes, 0)), 0) > $5::bigint
        ORDER BY count(*) DESC, max(ae.created_at) DESC, ae.actor_id
        LIMIT 50
      `,
      [tenantId, windowStart, windowEnd, thresholds.thresholdCount, thresholds.thresholdBytes],
    );
    return result.rows as BulkDownloadCandidateRow[];
  }

  private async insertAlert(
    client: QueryClient,
    tenantId: string,
    candidate: BulkDownloadCandidateRow,
    thresholds: BulkDownloadThresholds,
    window: { windowEnd: Date; windowStart: Date },
  ): Promise<string | null> {
    const result = await client.query(
      `
        INSERT INTO dlp_behavior_alerts (
          tenant_id, actor_user_id, matter_id, window_start, window_end,
          event_count, total_bytes, threshold_count, threshold_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, actor_user_id, window_start)
        DO NOTHING
        RETURNING alert_id::text AS alert_id
      `,
      [
        tenantId,
        candidate.actor_user_id,
        candidate.matter_id,
        window.windowStart,
        window.windowEnd,
        candidate.event_count,
        candidate.total_bytes,
        thresholds.thresholdCount,
        thresholds.thresholdBytes,
      ],
    );
    const [row] = result.rows as InsertAlertRow[];
    return row?.alert_id ?? null;
  }

  private async attachAuditAndNotify(
    client: QueryClient,
    tenantId: string,
    alertId: string,
    candidate: BulkDownloadCandidateRow,
    auditEventId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE dlp_behavior_alerts
        SET created_audit_event_id = coalesce(created_audit_event_id, $3),
          last_audit_event_id = $3,
          updated_at = now()
        WHERE tenant_id = $1
          AND alert_id = $2
      `,
      [tenantId, alertId, auditEventId],
    );
    await client.query(
      `
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, 'operational_data', 'dlp_bulk_download', 'dlp_behavior_alert', $2, $3, NULL,
          'records_admin', NULL, 'records_admin', $4, $5, $5
        )
        ON CONFLICT (
          tenant_id, source, kind, target_type, target_id, recipient_key
        )
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
      `,
      [tenantId, alertId, candidate.matter_id, candidate.last_download_at, auditEventId],
    );
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await ensureBulkDownloadMonitorSchedule(boss);
    await boss.work<BulkDownloadMonitorJobPayload>(
      bulkDownloadMonitorQueueName,
      bulkDownloadMonitorWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleBulkDownloadMonitorJob(job)));
      },
    );
    await boss.work<BulkDownloadMonitorJobPayload>(
      bulkDownloadMonitorDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'DLP_BULK_DOWNLOAD_JOB_DEAD_LETTER',
          asOf: job.data.asOf ?? null,
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleBulkDownloadMonitorJob(
    job: Job<BulkDownloadMonitorJobPayload>,
  ): Promise<void> {
    const asOf = parseAsOf(job.data.asOf);
    await this.sweepBulkDownloadAlerts(asOf ? { asOf } : {});
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: bulkDownloadMonitorDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: bulkDownloadMonitorQueueName,
      options: {
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
        deadLetter: bulkDownloadMonitorDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(bulkDownloadMonitorQueueName);
  }
}

export function resolveBulkDownloadThresholds(settings: unknown): BulkDownloadThresholds {
  const record = isRecord(settings) ? settings : {};
  return {
    thresholdCount: numberSetting(
      record,
      'dlpBulkDownloadThresholdCount',
      defaultThresholdCount,
      1,
      10_000,
    ),
    thresholdBytes: numberSetting(
      record,
      'dlpBulkDownloadThresholdBytes',
      defaultThresholdBytes,
      1,
      1024 * 1024 * 1024 * 1024,
    ),
    windowMinutes: numberSetting(
      record,
      'dlpBulkDownloadWindowMinutes',
      defaultWindowMinutes,
      5,
      24 * 60,
    ),
  };
}

export function isBulkDownloadMonitorWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('DLP_BULK_DOWNLOAD_MONITOR_WORKER_ENABLED', env);
}

export function bulkDownloadMonitorCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.DLP_BULK_DOWNLOAD_MONITOR_CRON?.trim() || '*/5 * * * *';
}

export function bulkDownloadMonitorScheduleOptions(): ScheduleOptions {
  return {
    key: bulkDownloadMonitorScheduleKey,
    tz: 'UTC',
    singletonKey: bulkDownloadMonitorScheduleKey,
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deadLetter: bulkDownloadMonitorDeadLetterQueueName,
  };
}

export function bulkDownloadMonitorWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function ensureBulkDownloadMonitorSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    bulkDownloadMonitorQueueName,
    bulkDownloadMonitorCron(),
    { scope: 'bulk-download' },
    bulkDownloadMonitorScheduleOptions(),
  );
}

function mapDlpBehaviorAlert(row: DlpBehaviorAlertRow): DlpBehaviorAlertDto {
  return dlpBehaviorAlertSchema.parse({
    alertId: row.alert_id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorSafeLabel: row.actor_safe_label,
    actorDisplayEmail: row.actor_display_email,
    matterId: row.matter_id,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    eventCount: row.event_count,
    totalBytes: Number(row.total_bytes),
    thresholdCount: row.threshold_count,
    thresholdBytes: Number(row.threshold_bytes),
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

function parseAsOf(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('asOf must be an ISO timestamp');
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = settings[key];
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) return fallback;
  return numberValue;
}
