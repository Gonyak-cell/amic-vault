import { ForbiddenException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { tenantQuery } from '../../common/db/tenant-query';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { FilePromotionService } from './file-promotion.service';
import { FileScanQueueService } from './file-scan-queue.service';
import type { FileSecurityScanJobPayload } from './file-security.types';

export const fileSecurityReconcileQueueName = 'security.file-reconcile';
export const fileSecurityReconcileDeadLetterQueueName = 'security.file-reconcile.dead';
export const fileSecurityReconcileScheduleKey = 'nightly-utc';

type ReconciliationIssueCode =
  | 'quarantine_object_without_row'
  | 'row_without_object'
  | 'clean_without_promotion'
  | 'primary_orphan'
  | 'stale_signature';

interface ReconciliationScanRow {
  scan_id: string;
  matter_id: string;
  quarantine_ref: string;
  quarantine_storage_uri: string;
  expected_sha256: string;
  state: string;
  result_code: string;
  signature_at: Date | null;
  promotion_file_object_id: string | null;
  primary_storage_uri: string | null;
}

interface RetryTarget {
  tenant_id: string;
  scan_id: string;
  matter_id: string;
  quarantine_ref: string;
  quarantine_storage_uri: string;
  expected_sha256: string;
  state: string;
  result_code: string;
  signature_at: Date | null;
  legal_hold: boolean;
  promotion_file_object_id: string | null;
}

export interface FileSecurityReconciliationSummary {
  tenantId: string;
  inspectedCount: number;
  inventoryTruncated: boolean;
  counts: Record<ReconciliationIssueCode, number>;
}

export interface FileSecurityReviewInput {
  tenantId: string;
  actorUserId: string;
  reasonCode: string;
  scanId?: string;
  quarantineRef?: string;
}

export interface FileSecurityRetryInput {
  tenantId: string;
  actorUserId: string;
  scanId: string;
  reasonCode: string;
}

export interface FileSecurityReconcileJobPayload {
  scope?: 'all-tenants';
}

const issueCodes: readonly ReconciliationIssueCode[] = [
  'quarantine_object_without_row',
  'row_without_object',
  'clean_without_promotion',
  'primary_orphan',
  'stale_signature',
];
const reasonCodePattern = /^[A-Z0-9_]{3,64}$/u;
const defaultBatchSize = 100;
const defaultMaxSignatureAgeSeconds = 24 * 60 * 60;

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function documentLocked(): ForbiddenException {
  return new ForbiddenException({ code: 'DOCUMENT_LOCKED' });
}

function batchSize(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.FILE_SECURITY_RECONCILIATION_BATCH_SIZE ?? defaultBatchSize);
  return Number.isSafeInteger(value) && value > 0 && value <= 500 ? value : defaultBatchSize;
}

function maxSignatureAgeSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.FILE_SECURITY_MAX_SIGNATURE_AGE_SECONDS ?? defaultMaxSignatureAgeSeconds);
  return Number.isSafeInteger(value) && value > 0 ? value : defaultMaxSignatureAgeSeconds;
}

export function fileSecuritySignatureIsFresh(value: Date | null, now = Date.now()): boolean {
  return value !== null && now - value.getTime() >= 0 && now - value.getTime() <= maxSignatureAgeSeconds() * 1000;
}

export function isFileSecurityReconcilerWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('FILE_SECURITY_RECONCILIATION_WORKER_ENABLED', env);
}

export function fileSecurityReconcileCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.FILE_SECURITY_RECONCILIATION_CRON?.trim() || '40 0 * * *';
}

export function fileSecurityReconcileScheduleOptions(): ScheduleOptions {
  return {
    key: fileSecurityReconcileScheduleKey,
    tz: 'UTC',
    singletonKey: fileSecurityReconcileScheduleKey,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
    deadLetter: fileSecurityReconcileDeadLetterQueueName,
  };
}

export function fileSecurityReconcileWorkOptions(): WorkOptions {
  return { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 5 };
}

export async function ensureFileSecurityReconcileSchedule(boss: Pick<PgBoss, 'schedule'>): Promise<void> {
  await boss.schedule(
    fileSecurityReconcileQueueName,
    fileSecurityReconcileCron(),
    { scope: 'all-tenants' },
    fileSecurityReconcileScheduleOptions(),
  );
}

@Injectable()
export class FileSecurityReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(FileSecurityReconcilerService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;
  private latestSummary: FileSecurityReconciliationSummary | undefined;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(FilePromotionService) private readonly filePromotionService: Pick<FilePromotionService, 'promote'>,
    @Inject(FileScanQueueService) private readonly fileScanQueue: Pick<FileScanQueueService, 'enqueue'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
    @Inject(StorageService) private readonly storageService: Pick<StorageService, 'headByStorageUri' | 'listQuarantineRefs'>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isFileSecurityReconcilerWorkerEnabled()) return;
    await this.registerWorker();
  }

  health(): FileSecurityReconciliationSummary | null {
    return this.latestSummary ?? null;
  }

  async reconcileAllTenants(): Promise<readonly FileSecurityReconciliationSummary[]> {
    const summaries: FileSecurityReconciliationSummary[] = [];
    for (const tenantId of await this.databaseService.listActiveTenantRegistryIds()) {
      try {
        summaries.push(await this.reconcileTenant(tenantId));
      } catch {
        this.logger.warn({ code: 'FILE_SECURITY_RECONCILIATION_TENANT_FAILED' });
      }
    }
    return summaries;
  }

  async reconcileTenant(tenantId: string): Promise<FileSecurityReconciliationSummary> {
    const limit = batchSize();
    const inventory = await this.storageService.listQuarantineRefs(tenantId);
    const inventoryRefs = inventory.slice(0, limit);
    const scans = await this.findScans(tenantId, limit);
    const counts = this.emptyCounts();
    const knownRefs = await this.findKnownQuarantineRefs(tenantId, inventoryRefs);
    for (const ref of inventoryRefs) if (!knownRefs.has(ref)) counts.quarantine_object_without_row += 1;
    for (const scan of scans) {
      const issues = await this.classifyScan(tenantId, scan);
      for (const issue of issues) counts[issue] += 1;
    }
    const summary = {
      tenantId,
      inspectedCount: scans.length + inventoryRefs.length,
      inventoryTruncated: inventory.length > inventoryRefs.length || scans.length === limit,
      counts,
    };
    this.latestSummary = summary;
    return summary;
  }

  async review(input: FileSecurityReviewInput): Promise<{ issueCode: ReconciliationIssueCode }> {
    this.assertReviewInput(input);
    await this.assertSecurityAdmin(input.tenantId, input.actorUserId);
    const issueCode = input.scanId
      ? await this.findScanIssue(input.tenantId, input.scanId)
      : await this.findObjectWithoutRowIssue(input.tenantId, input.quarantineRef as string);
    const targetId = input.scanId ?? input.quarantineRef;
    if (!targetId) throw permissionDenied();
    await this.auditService.transaction(input.tenantId, async (tx) => {
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          action: 'FILE_SECURITY_RECONCILIATION_REVIEWED',
          targetType: input.scanId ? 'file_security_scan' : 'file_security_quarantine',
          targetId,
          result: 'success',
          metadata: { reason_code: input.reasonCode, issue_code: issueCode },
        },
        tx,
      );
    });
    return { issueCode };
  }

  async retry(input: FileSecurityRetryInput): Promise<{ action: 'rescan' | 'promote' }> {
    if (!reasonCodePattern.test(input.reasonCode)) throw permissionDenied();
    await this.assertSecurityAdmin(input.tenantId, input.actorUserId);
    const target = await this.findRetryTarget(input.tenantId, input.scanId);
    if (!target || target.tenant_id !== input.tenantId) throw permissionDenied();
    if (target.legal_hold) throw documentLocked();
    if (!(await this.storageService.headByStorageUri(input.tenantId, target.quarantine_storage_uri))) {
      throw permissionDenied();
    }
    const action = await this.auditService.transaction(input.tenantId, async (tx) => {
      const current = await this.findRetryTarget(input.tenantId, input.scanId, tx, true);
      if (!current || current.tenant_id !== input.tenantId) throw permissionDenied();
      if (current.legal_hold) throw documentLocked();
      if (current.state === 'infected' || current.state === 'promoted') throw permissionDenied();
      const canPromote = current.state === 'clean'
        && current.result_code === 'clean'
        && !current.promotion_file_object_id
        && fileSecuritySignatureIsFresh(current.signature_at);
      const canRescan = ['quarantined', 'error', 'security_hold'].includes(current.state);
      if (!canPromote && !canRescan) throw permissionDenied();
      const result = canPromote ? 'promote' as const : 'rescan' as const;
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          action: 'FILE_SECURITY_RECONCILIATION_RETRY_REQUESTED',
          targetType: 'file_security_scan',
          targetId: current.scan_id,
          matterId: current.matter_id,
          result: 'success',
          metadata: { hash: current.expected_sha256, reason_code: input.reasonCode },
        },
        tx,
      );
      if (result === 'rescan') {
        await this.fileScanQueue.enqueue(this.payloadFor(current), tx as never);
      }
      return result;
    });
    if (action === 'promote') await this.filePromotionService.promote(this.payloadFor(target));
    return { action };
  }

  private async registerWorker(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(fileSecurityReconcileQueueName);
    await ensureFileSecurityReconcileSchedule(boss);
    await boss.work<FileSecurityReconcileJobPayload>(
      fileSecurityReconcileQueueName,
      fileSecurityReconcileWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map(() => this.reconcileAllTenants()));
      },
    );
    this.workerRegistered = true;
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({ name: fileSecurityReconcileDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: fileSecurityReconcileQueueName, options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, deadLetter: fileSecurityReconcileDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueDefinitionsRegistered = true;
  }

  private async findScans(tenantId: string, limit: number): Promise<ReconciliationScanRow[]> {
    const result = await tenantQuery<ReconciliationScanRow>(this.databaseService, tenantId, `
      SELECT s.scan_id, s.matter_id, s.quarantine_ref, s.quarantine_storage_uri, s.expected_sha256,
        s.state, s.result_code, s.signature_at, p.file_object_id AS promotion_file_object_id,
        f.storage_uri AS primary_storage_uri
      FROM file_security_scans s
      LEFT JOIN file_security_promotions p ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
      LEFT JOIN file_objects f ON f.tenant_id = p.tenant_id AND f.file_object_id = p.file_object_id
      WHERE s.tenant_id = $1
      ORDER BY s.updated_at ASC, s.scan_id ASC
      LIMIT $2
    `, [tenantId, limit]);
    return result.rows;
  }

  private async findKnownQuarantineRefs(tenantId: string, refs: readonly string[]): Promise<Set<string>> {
    if (refs.length === 0) return new Set();
    const result = await tenantQuery<{ quarantine_ref: string }>(this.databaseService, tenantId, `
      SELECT quarantine_ref FROM file_security_scans
      WHERE tenant_id = $1 AND quarantine_ref = ANY($2::uuid[])
    `, [tenantId, refs]);
    return new Set(result.rows.map((row) => row.quarantine_ref));
  }

  private async classifyScan(tenantId: string, scan: ReconciliationScanRow): Promise<ReconciliationIssueCode[]> {
    const issues: ReconciliationIssueCode[] = [];
    if (!(await this.storageService.headByStorageUri(tenantId, scan.quarantine_storage_uri))) {
      issues.push('row_without_object');
    }
    if (scan.state === 'clean' && !scan.promotion_file_object_id) issues.push('clean_without_promotion');
    if (scan.promotion_file_object_id && (!scan.primary_storage_uri || !(await this.storageService.headByStorageUri(tenantId, scan.primary_storage_uri)))) {
      issues.push('primary_orphan');
    }
    if (scan.state === 'clean' && !fileSecuritySignatureIsFresh(scan.signature_at)) issues.push('stale_signature');
    return issues;
  }

  private async findScanIssue(tenantId: string, scanId: string): Promise<ReconciliationIssueCode> {
    const scans = await tenantQuery<ReconciliationScanRow>(this.databaseService, tenantId, `
      SELECT s.tenant_id, s.scan_id, s.matter_id, s.quarantine_ref, s.quarantine_storage_uri, s.expected_sha256,
        s.state, s.result_code, s.signature_at, p.file_object_id AS promotion_file_object_id,
        f.storage_uri AS primary_storage_uri
      FROM file_security_scans s
      LEFT JOIN file_security_promotions p ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
      LEFT JOIN file_objects f ON f.tenant_id = p.tenant_id AND f.file_object_id = p.file_object_id
      WHERE s.tenant_id = $1 AND s.scan_id = $2
      LIMIT 1
    `, [tenantId, scanId]);
    const scan = scans.rows[0];
    if (!scan) throw permissionDenied();
    const issue = (await this.classifyScan(tenantId, scan))[0];
    if (!issue) throw permissionDenied();
    return issue;
  }

  private async findObjectWithoutRowIssue(tenantId: string, quarantineRef: string): Promise<ReconciliationIssueCode> {
    const refs = await this.storageService.listQuarantineRefs(tenantId);
    if (!refs.includes(quarantineRef)) throw permissionDenied();
    const known = await this.findKnownQuarantineRefs(tenantId, [quarantineRef]);
    if (known.has(quarantineRef)) throw permissionDenied();
    return 'quarantine_object_without_row';
  }

  private async findRetryTarget(
    tenantId: string,
    scanId: string,
    client?: QueryClient,
    lock = false,
  ): Promise<RetryTarget | null> {
    const sql = `
      SELECT s.tenant_id, s.scan_id, s.matter_id, s.quarantine_ref, s.quarantine_storage_uri, s.expected_sha256,
        s.state, s.result_code, s.signature_at, m.legal_hold,
        p.file_object_id AS promotion_file_object_id
      FROM file_security_scans s
      JOIN matters m ON m.tenant_id = s.tenant_id AND m.matter_id = s.matter_id
      LEFT JOIN file_security_promotions p ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
      WHERE s.tenant_id = $1 AND s.scan_id = $2
      LIMIT 1${lock ? ' FOR UPDATE OF s, m' : ''}
    `;
    const result = client
      ? await client.query(sql, [tenantId, scanId])
      : await tenantQuery<RetryTarget>(this.databaseService, tenantId, sql, [tenantId, scanId]);
    return (result.rows[0] as RetryTarget | undefined) ?? null;
  }

  private async assertSecurityAdmin(tenantId: string, actorUserId: string): Promise<void> {
    const result = await tenantQuery<{ role: string; status: string }>(this.databaseService, tenantId, `
      SELECT role, status FROM users WHERE tenant_id = $1 AND user_id = $2 LIMIT 1
    `, [tenantId, actorUserId]);
    const actor = result.rows[0];
    if (!actor || actor.status !== 'active' || !['firm_admin', 'security_admin'].includes(actor.role)) {
      throw permissionDenied();
    }
  }

  private assertReviewInput(input: FileSecurityReviewInput): void {
    if (!reasonCodePattern.test(input.reasonCode) || Boolean(input.scanId) === Boolean(input.quarantineRef)) {
      throw permissionDenied();
    }
  }

  private payloadFor(target: Pick<RetryTarget, 'tenant_id' | 'quarantine_ref' | 'expected_sha256'>): FileSecurityScanJobPayload {
    return { tenantId: target.tenant_id, quarantineRef: target.quarantine_ref, expectedSha256: target.expected_sha256 };
  }

  private emptyCounts(): Record<ReconciliationIssueCode, number> {
    return Object.fromEntries(issueCodes.map((issue) => [issue, 0])) as Record<ReconciliationIssueCode, number>;
  }
}
