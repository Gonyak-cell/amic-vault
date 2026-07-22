import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import {
  StorageAccessDeniedError,
  StorageExactVersionMissingError,
  StorageRequestTimeoutError,
  StorageUnavailableError,
  StorageVersionFingerprintUnavailableError,
} from '../storage/storage-adapter.interface';
import { StorageService } from '../storage/storage.service';
import {
  sealedDisposalInventoryHash,
  type DisposalInventoryObjectKind,
  type DisposalReceiptOutcome,
  type SealedDisposalInventoryEntry,
} from './disposal-receipt.types';
import { RetentionTenantReader } from './retention-scheduler.service';

export const recordsDisposalQueueName = 'records.disposal.execute';
export const recordsDisposalScheduleKey = 'sealed-inventory';

interface ClaimedDisposal {
  disposalOutboxId: string;
  claimToken: string;
}

interface ExecutionTargetRow {
  disposal_outbox_id: string;
  disposal_request_id: string;
  inventory_hash: string;
  document_id: string;
  matter_id: string;
  request_status: string;
  approved_by: string | null;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
}

interface InventoryRow {
  disposal_inventory_id: string;
  document_id: string;
  document_version_id: string | null;
  file_object_id: string;
  object_kind: DisposalInventoryObjectKind;
  storage_key_hash: string;
  storage_version_fingerprint: string;
  content_sha256: string;
  canonical_ordinal: number;
  storage_uri: string | null;
  receipt_outcome: DisposalReceiptOutcome | null;
}

type TerminalState = 'blocked' | 'dead_letter';
type FailureCode =
  | 'hold_activated'
  | 'object_lock'
  | 'version_unavailable'
  | 'storage_forbidden'
  | 'storage_timeout'
  | 'storage_unavailable'
  | 'reconcile_failed'
  | 'inventory_invalid';

class DisposalWorkerFailure extends Error {
  constructor(
    readonly state: TerminalState,
    readonly code: FailureCode,
  ) {
    super(code);
  }
}

export interface RunRecordsDisposalOptions {
  limit?: number;
  staleAfterSeconds?: number;
}

export interface RunRecordsDisposalResult {
  claimedCount: number;
  completedCount: number;
  blockedCount: number;
  deadLetterCount: number;
}

@Injectable()
export class RecordsDisposalWorker implements OnModuleInit {
  private readonly logger = new Logger(RecordsDisposalWorker.name);
  private queueRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(RetentionTenantReader)
    private readonly tenantReader: Pick<RetentionTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueue();
    if (currentProcessRole() !== 'worker' || !isRecordsDisposalWorkerEnabled()) return;
    await this.registerWorker();
  }

  async runOnceForTenant(
    tenantId: string,
    options: RunRecordsDisposalOptions = {},
  ): Promise<RunRecordsDisposalResult> {
    const claimed = await this.claimPending(tenantId, options);
    const result: RunRecordsDisposalResult = {
      claimedCount: claimed.length,
      completedCount: 0,
      blockedCount: 0,
      deadLetterCount: 0,
    };
    for (const claim of claimed) {
      try {
        await this.executeClaim(tenantId, claim);
        result.completedCount += 1;
      } catch (error) {
        const failure = classifyRecordsDisposalFailure(error);
        await this.markTerminal(tenantId, claim, failure);
        if (failure.state === 'blocked') result.blockedCount += 1;
        else result.deadLetterCount += 1;
      }
    }
    return result;
  }

  private async runOnceForAllTenants(): Promise<void> {
    for (const tenantId of await this.tenantReader.listActiveTenantIds()) {
      try {
        await this.runOnceForTenant(tenantId);
      } catch {
        this.logger.warn({ code: 'RECORDS_DISPOSAL_WORKER_TENANT_FAILED' });
      }
    }
  }

  private async claimPending(
    tenantId: string,
    options: RunRecordsDisposalOptions,
  ): Promise<ClaimedDisposal[]> {
    const limit = boundedPositiveInteger(options.limit, 25, 100);
    const staleAfterSeconds = boundedPositiveInteger(options.staleAfterSeconds, 300, 3600);
    return this.auditService.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE records_disposal_outbox
          SET state = 'pending',
            claim_token = NULL,
            claim_started_at = NULL,
            updated_at = now()
          WHERE tenant_id = $1
            AND state = 'processing'
            AND claim_started_at < now() - ($2::integer * interval '1 second')
        `,
        [tenantId, staleAfterSeconds],
      );
      const claimed = await client.query<ClaimedDisposal>(
        `
          WITH selected AS (
            SELECT disposal_outbox_id
            FROM records_disposal_outbox
            WHERE tenant_id = $1
              AND state = 'pending'
            ORDER BY sealed_at ASC, disposal_outbox_id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          UPDATE records_disposal_outbox outbox
          SET state = 'processing',
            attempt_count = attempt_count + 1,
            claim_token = gen_random_uuid(),
            claim_started_at = now(),
            updated_at = now()
          FROM selected
          WHERE outbox.tenant_id = $1
            AND outbox.disposal_outbox_id = selected.disposal_outbox_id
          RETURNING outbox.disposal_outbox_id::text AS "disposalOutboxId",
            outbox.claim_token::text AS "claimToken"
        `,
        [tenantId, limit],
      );
      return claimed.rows;
    });
  }

  private async executeClaim(tenantId: string, claim: ClaimedDisposal): Promise<void> {
    const inventoryIds = await this.auditService.transaction(tenantId, async (client) => {
      const target = await this.lockExecutionTarget(client, tenantId, claim);
      this.assertExecutionTarget(target);
      return (await this.readSealedInventory(client, tenantId, claim, target)).map(
        (entry) => entry.disposal_inventory_id,
      );
    });
    for (const inventoryId of inventoryIds) {
      await this.executeInventoryEntry(tenantId, claim, inventoryId);
    }
    await this.auditService.transaction(tenantId, async (client) => {
      const target = await this.lockExecutionTarget(client, tenantId, claim);
      this.assertExecutionTarget(target);
      const inventory = await this.readSealedInventory(client, tenantId, claim, target);
      const receiptCount = await client.query(
        `
          SELECT count(*)::text AS count
          FROM records_disposal_receipts
          WHERE tenant_id = $1
            AND disposal_outbox_id = $2
        `,
        [tenantId, claim.disposalOutboxId],
      );
      if (
        Number((receiptCount.rows[0] as { count?: string } | undefined)?.count ?? '0') !==
        inventory.length
      ) {
        throw new DisposalWorkerFailure('dead_letter', 'reconcile_failed');
      }
      const completed = await client.query(
        `
          UPDATE records_disposal_outbox
          SET state = 'completed',
            claim_token = NULL,
            claim_started_at = NULL,
            completed_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND disposal_outbox_id = $2
            AND claim_token = $3
            AND state = 'processing'
        `,
        [tenantId, claim.disposalOutboxId, claim.claimToken],
      );
      if (completed.rowCount !== 1) throw new DisposalWorkerFailure('dead_letter', 'reconcile_failed');
      await this.auditService.log(
        {
          tenantId,
          actorType: 'system',
          actorId: null,
          action: 'DISPOSAL_EXECUTED',
          targetType: 'records_disposal_outbox',
          targetId: claim.disposalOutboxId,
          matterId: target.matter_id,
          metadata: {
            disposal_request_id: target.disposal_request_id,
            document_id: target.document_id,
            evidence_id: claim.disposalOutboxId,
            hash: target.inventory_hash,
            item_count: inventory.length,
            status_before: 'processing',
            status_after: 'completed',
          },
        },
        client,
      );
    });
  }

  private async executeInventoryEntry(
    tenantId: string,
    claim: ClaimedDisposal,
    inventoryId: string,
  ): Promise<void> {
    await this.auditService.transaction(tenantId, async (client) => {
      const target = await this.lockExecutionTarget(client, tenantId, claim);
      this.assertExecutionTarget(target);
      const entry = (await this.readSealedInventory(client, tenantId, claim, target)).find(
        (candidate) => candidate.disposal_inventory_id === inventoryId,
      );
      if (!entry) throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
      if (entry.receipt_outcome !== null) return;
      if (!entry.storage_uri) throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
      const inspection = await this.storageService.inspectSealedVersionByStorageUri(
        tenantId,
        entry.storage_uri,
        entry.storage_version_fingerprint,
      );
      if (!inspection.present) {
        await this.insertReceipt(client, tenantId, claim.disposalOutboxId, entry, 'already_absent');
        return;
      }
      if (inspection.objectLockProtected) throw new DisposalWorkerFailure('blocked', 'object_lock');
      try {
        await this.storageService.deleteSealedVersion(inspection.version);
      } catch (error) {
        if (!(error instanceof StorageExactVersionMissingError)) throw error;
      }
      if (await this.storageService.sealedVersionIsPresent(inspection.version)) {
        throw new DisposalWorkerFailure('dead_letter', 'reconcile_failed');
      }
      await this.insertReceipt(client, tenantId, claim.disposalOutboxId, entry, 'deleted');
    });
  }

  private async lockExecutionTarget(
    client: QueryClient,
    tenantId: string,
    claim: ClaimedDisposal,
  ): Promise<ExecutionTargetRow> {
    const result = await client.query(
      `
        SELECT outbox.disposal_outbox_id, outbox.disposal_request_id, outbox.inventory_hash,
          d.document_id, d.matter_id, dr.status AS request_status, dr.approved_by,
          d.legal_hold AS document_legal_hold, m.legal_hold AS matter_legal_hold
        FROM records_disposal_outbox outbox
        JOIN disposal_requests dr
          ON dr.tenant_id = outbox.tenant_id
          AND dr.disposal_request_id = outbox.disposal_request_id
        JOIN documents d
          ON d.tenant_id = outbox.tenant_id
          AND d.document_id = dr.document_id
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE outbox.tenant_id = $1
          AND outbox.disposal_outbox_id = $2
          AND outbox.claim_token = $3
          AND outbox.state = 'processing'
        FOR UPDATE OF outbox, dr, d, m
      `,
      [tenantId, claim.disposalOutboxId, claim.claimToken],
    );
    const target = result.rows[0] as ExecutionTargetRow | undefined;
    if (!target) throw new DisposalWorkerFailure('dead_letter', 'inventory_invalid');
    return target;
  }

  private assertExecutionTarget(target: ExecutionTargetRow): void {
    if (target.request_status !== 'approved' || !target.approved_by) {
      throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
    }
    if (target.document_legal_hold || target.matter_legal_hold) {
      throw new DisposalWorkerFailure('blocked', 'hold_activated');
    }
  }

  private async readSealedInventory(
    client: QueryClient,
    tenantId: string,
    claim: ClaimedDisposal,
    target: ExecutionTargetRow,
  ): Promise<InventoryRow[]> {
    const holds = await client.query(
      `
        SELECT count(*)::text AS count
        FROM legal_holds
        WHERE tenant_id = $1
          AND status = 'active'
          AND ((hold_scope = 'matter' AND matter_id = $2)
            OR (hold_scope = 'document' AND document_id = $3))
      `,
      [tenantId, target.matter_id, target.document_id],
    );
    if (Number((holds.rows[0] as { count?: string } | undefined)?.count ?? '0') > 0) {
      throw new DisposalWorkerFailure('blocked', 'hold_activated');
    }
    const result = await client.query(
      `
        SELECT inventory.disposal_inventory_id, inventory.document_id,
          inventory.document_version_id, inventory.file_object_id, inventory.object_kind,
          inventory.storage_key_hash, inventory.storage_version_fingerprint,
          inventory.content_sha256, inventory.canonical_ordinal,
          files.storage_uri, receipt.outcome AS receipt_outcome
        FROM records_disposal_inventory inventory
        LEFT JOIN file_objects files
          ON files.tenant_id = inventory.tenant_id
          AND files.file_object_id = inventory.file_object_id
          AND files.sha256 = inventory.content_sha256
        LEFT JOIN records_disposal_receipts receipt
          ON receipt.tenant_id = inventory.tenant_id
          AND receipt.disposal_outbox_id = inventory.disposal_outbox_id
          AND receipt.disposal_inventory_id = inventory.disposal_inventory_id
        WHERE inventory.tenant_id = $1
          AND inventory.disposal_outbox_id = $2
          AND inventory.document_id = $3
        ORDER BY inventory.canonical_ordinal ASC
      `,
      [tenantId, claim.disposalOutboxId, target.document_id],
    );
    const inventory = result.rows as InventoryRow[];
    if (inventory.length === 0) throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
    const entries: SealedDisposalInventoryEntry[] = inventory.map((entry) => ({
      documentId: entry.document_id,
      documentVersionId: entry.document_version_id,
      fileObjectId: entry.file_object_id,
      objectKind: entry.object_kind,
      storageKeyHash: entry.storage_key_hash,
      storageVersionFingerprint: entry.storage_version_fingerprint,
      contentSha256: entry.content_sha256,
      canonicalOrdinal: entry.canonical_ordinal,
    }));
    if (sealedDisposalInventoryHash(entries) !== target.inventory_hash) {
      throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
    }
    for (const entry of inventory) {
      if (!entry.storage_uri || sha256Hex(entry.storage_uri) !== entry.storage_key_hash) {
        throw new DisposalWorkerFailure('blocked', 'inventory_invalid');
      }
    }
    return inventory;
  }

  private async insertReceipt(
    client: QueryClient,
    tenantId: string,
    disposalOutboxId: string,
    entry: InventoryRow,
    outcome: DisposalReceiptOutcome,
  ): Promise<void> {
    const result = await client.query(
      `
        INSERT INTO records_disposal_receipts (
          tenant_id, disposal_outbox_id, disposal_inventory_id, outcome, receipt_hash
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, disposal_outbox_id, disposal_inventory_id) DO NOTHING
      `,
      [
        tenantId,
        disposalOutboxId,
        entry.disposal_inventory_id,
        outcome,
        receiptHash(disposalOutboxId, entry.disposal_inventory_id, outcome),
      ],
    );
    if (result.rowCount !== 1) throw new DisposalWorkerFailure('dead_letter', 'reconcile_failed');
  }

  private async markTerminal(
    tenantId: string,
    claim: ClaimedDisposal,
    failure: Pick<DisposalWorkerFailure, 'state' | 'code'>,
  ): Promise<void> {
    await this.auditService.transaction(tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE records_disposal_outbox outbox
          SET state = $4,
            claim_token = NULL,
            claim_started_at = NULL,
            terminal_at = now(),
            last_error_code = $5,
            updated_at = now()
          FROM disposal_requests dr
          JOIN documents d
            ON d.tenant_id = dr.tenant_id
            AND d.document_id = dr.document_id
          WHERE outbox.tenant_id = $1
            AND outbox.disposal_outbox_id = $2
            AND outbox.claim_token = $3
            AND outbox.state = 'processing'
            AND dr.tenant_id = outbox.tenant_id
            AND dr.disposal_request_id = outbox.disposal_request_id
          RETURNING outbox.inventory_hash, outbox.disposal_request_id, d.matter_id, d.document_id
        `,
        [tenantId, claim.disposalOutboxId, claim.claimToken, failure.state, failure.code],
      );
      const target = result.rows[0] as
        | Pick<ExecutionTargetRow, 'matter_id' | 'document_id' | 'inventory_hash' | 'disposal_request_id'>
        | undefined;
      if (!target) return;
      await this.auditService.log(
        {
          tenantId,
          actorType: 'system',
          actorId: null,
          action: 'DISPOSAL_EXECUTED',
          targetType: 'records_disposal_outbox',
          targetId: claim.disposalOutboxId,
          matterId: target.matter_id,
          result: 'failure',
          metadata: {
            disposal_request_id: target.disposal_request_id,
            document_id: target.document_id,
            evidence_id: claim.disposalOutboxId,
            hash: target.inventory_hash,
            blocked_reason: failure.code,
            status_before: 'processing',
            status_after: failure.state,
          },
        },
        client,
      );
    });
  }

  private registerQueue(): void {
    if (this.queueRegistered) return;
    this.queueRegistry.register({
      name: recordsDisposalQueueName,
      options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 },
    });
    this.queueRegistered = true;
  }

  private async registerWorker(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(recordsDisposalQueueName);
    await ensureRecordsDisposalSchedule(boss);
    await boss.work<undefined>(recordsDisposalQueueName, recordsDisposalWorkOptions(), async (jobs) => {
      await Promise.all(jobs.map(async () => this.runOnceForAllTenants()));
    });
    this.workerRegistered = true;
  }
}

export function isRecordsDisposalWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('RECORDS_DISPOSAL_WORKER_ENABLED', env);
}

export function recordsDisposalWorkOptions(): WorkOptions {
  return { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 5 };
}

export function recordsDisposalScheduleOptions(): ScheduleOptions {
  return {
    key: recordsDisposalScheduleKey,
    singletonKey: recordsDisposalScheduleKey,
    retryLimit: 0,
    expireInSeconds: 60 * 60,
  };
}

export async function ensureRecordsDisposalSchedule(boss: Pick<PgBoss, 'schedule'>): Promise<void> {
  await boss.schedule(
    recordsDisposalQueueName,
    process.env.RECORDS_DISPOSAL_WORKER_CRON?.trim() || '*/1 * * * *',
    undefined,
    recordsDisposalScheduleOptions(),
  );
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) return fallback;
  return value;
}

function receiptHash(outboxId: string, inventoryId: string, outcome: DisposalReceiptOutcome): string {
  return createHash('sha256').update(`${outboxId}:${inventoryId}:${outcome}`).digest('hex');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function classifyRecordsDisposalFailure(error: unknown): {
  state: TerminalState;
  code: FailureCode;
} {
  if (error instanceof DisposalWorkerFailure) return error;
  if (error instanceof StorageVersionFingerprintUnavailableError) {
    return new DisposalWorkerFailure('blocked', 'version_unavailable');
  }
  if (error instanceof StorageAccessDeniedError) {
    return new DisposalWorkerFailure('dead_letter', 'storage_forbidden');
  }
  if (error instanceof StorageRequestTimeoutError) {
    return new DisposalWorkerFailure('dead_letter', 'storage_timeout');
  }
  if (error instanceof StorageUnavailableError) {
    return new DisposalWorkerFailure('dead_letter', 'storage_unavailable');
  }
  return new DisposalWorkerFailure('dead_letter', 'reconcile_failed');
}
