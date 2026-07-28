import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  createDocumentBulkActionBatchSchema,
  retryDocumentBulkActionBatchSchema,
  type CreateDocumentBulkActionBatchDto,
  type DocumentBulkActionBatchDto,
  type DocumentBulkActionBatchItemDto,
  type DocumentBulkActionBatchStatus,
  type DocumentBulkActionDto,
  type DocumentBulkActionItemStatus,
  type DocumentBulkActionJobDto,
  type ErrorCode,
  type RetryDocumentBulkActionBatchDto,
  type TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  documentBulkActionCompletedAudit,
  documentBulkActionCreatedAudit,
  documentBulkActionRetriedAudit,
} from './document-bulk-action.events';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';

export type DocumentBulkActionEnqueue = (
  payload: DocumentBulkActionJobDto,
  client: PoolClient,
) => Promise<string>;

interface BatchRow {
  batch_id: string;
  actor_user_id: string;
  action_kind: DocumentBulkActionDto['kind'];
  target_folder_id: string | null;
  target_tag: string | null;
  target_status: string | null;
  idempotency_key: string;
  request_hash: string;
  status: DocumentBulkActionBatchStatus;
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  created_at: Date;
  updated_at: Date;
  receipt_expires_at: Date;
}

interface ItemRow {
  batch_item_id: string;
  document_id: string;
  position: number;
  status: DocumentBulkActionItemStatus;
  error_code: ErrorCode | null;
  reason_code: string | null;
  retry_count: number;
  updated_at: Date;
}

export interface ClaimedDocumentBulkActionBatch {
  action: DocumentBulkActionDto;
  items: Array<{ itemId: string; documentId: string }>;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function parseCreateBody(body: unknown): CreateDocumentBulkActionBatchDto {
  const parsed = createDocumentBulkActionBatchSchema.safeParse(body ?? {});
  if (!parsed.success) throw validationFailed();
  return parsed.data;
}

function parseRetryBody(body: unknown): RetryDocumentBulkActionBatchDto {
  const parsed = retryDocumentBulkActionBatchSchema.safeParse(body ?? {});
  if (!parsed.success) throw validationFailed();
  return parsed.data;
}

function bindQuestionMarks(sql: string, firstParamIndex: number): string {
  let next = firstParamIndex;
  return sql.replaceAll('?', () => `$${next++}`);
}

export function documentBulkActionRequestHash(
  input: Pick<CreateDocumentBulkActionBatchDto, 'action' | 'documentIds'>,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: input.action, documentIds: input.documentIds }))
    .digest('hex');
}

function actionColumns(action: DocumentBulkActionDto): {
  folderId: string | null;
  tag: string | null;
  status: string | null;
} {
  if (action.kind === 'move_folder') {
    return { folderId: action.folderId, tag: null, status: null };
  }
  if (action.kind === 'add_tag' || action.kind === 'remove_tag') {
    return { folderId: null, tag: action.tag, status: null };
  }
  return { folderId: null, tag: null, status: action.status };
}

function actionFromRow(row: BatchRow): DocumentBulkActionDto {
  if (row.action_kind === 'move_folder' && row.target_folder_id) {
    return { kind: row.action_kind, folderId: row.target_folder_id };
  }
  if ((row.action_kind === 'add_tag' || row.action_kind === 'remove_tag') && row.target_tag) {
    return { kind: row.action_kind, tag: row.target_tag };
  }
  if (row.action_kind === 'transition_status' && row.target_status) {
    return {
      kind: row.action_kind,
      status: row.target_status as Extract<
        DocumentBulkActionDto,
        { kind: 'transition_status' }
      >['status'],
    };
  }
  throw new Error('DOCUMENT_BULK_ACTION_ROW_INVALID');
}

function toItemDto(row: ItemRow): DocumentBulkActionBatchItemDto {
  return {
    itemId: row.batch_item_id,
    documentId: row.document_id,
    position: row.position,
    status: row.status,
    errorCode: row.error_code,
    reasonCode: row.reason_code,
    retryCount: row.retry_count,
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class DocumentBulkActionBatchService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly searchPermissionScopeProvider: SearchPermissionScopeProvider,
  ) {}

  async createBatch(
    input: {
      actorUserId: string;
      body: unknown;
      tenantId: TenantId;
      tenantSlug: string;
    },
    enqueue: DocumentBulkActionEnqueue,
  ): Promise<DocumentBulkActionBatchDto> {
    const parsed = parseCreateBody(input.body);
    const requestHash = documentBulkActionRequestHash(parsed);
    const searchDecision = await this.searchPermissionScopeProvider
      .scopeForSearch({
        tenantId: input.tenantId,
        userId: input.actorUserId,
      })
      .catch(() => null);
    if (searchDecision?.effect !== 'ALLOW') throw notFoundDenied();
    const searchScopeSql = bindQuestionMarks(searchDecision.scope.sql, 4);

    return this.auditService.transaction(input.tenantId, async (tx) => {
      const existing = await this.findByIdempotencyKey(
        tx,
        input.tenantId,
        input.actorUserId,
        parsed.idempotencyKey,
        true,
      );
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw validationFailed('IDEMPOTENCY_KEY_REUSED');
        }
        return this.readBatch(tx, input.tenantId, input.actorUserId, existing.batch_id);
      }

      const parameters = actionColumns(parsed.action);
      const inserted = (await tx.query(
        `
          INSERT INTO document_bulk_action_batches (
            tenant_id,
            actor_user_id,
            action_kind,
            target_folder_id,
            target_tag,
            target_status,
            idempotency_key,
            request_hash,
            total_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (tenant_id, actor_user_id, idempotency_key) DO NOTHING
          RETURNING batch_id
        `,
        [
          input.tenantId,
          input.actorUserId,
          parsed.action.kind,
          parameters.folderId,
          parameters.tag,
          parameters.status,
          parsed.idempotencyKey,
          requestHash,
          parsed.documentIds.length,
        ],
      )) as { rows: Array<{ batch_id: string }>; rowCount: number | null };
      const batchId = inserted.rows[0]?.batch_id;
      if (!batchId) {
        const concurrent = await this.findByIdempotencyKey(
          tx,
          input.tenantId,
          input.actorUserId,
          parsed.idempotencyKey,
          false,
        );
        if (!concurrent) throw new Error('document bulk action batch insert returned no row');
        if (concurrent.request_hash !== requestHash) {
          throw validationFailed('IDEMPOTENCY_KEY_REUSED');
        }
        return this.readBatch(tx, input.tenantId, input.actorUserId, concurrent.batch_id);
      }

      const insertedItems = (await tx.query(
        `
          INSERT INTO document_bulk_action_items (
            tenant_id,
            batch_id,
            document_id,
            position
          )
          SELECT $1, $2, selected.document_id, selected.ordinal - 1
          FROM unnest($3::uuid[]) WITH ORDINALITY AS selected(document_id, ordinal)
          INNER JOIN documents AS document
            ON document.tenant_id = $1
           AND document.document_id = selected.document_id
          CROSS JOIN LATERAL (
            SELECT document.tenant_id, document.document_id, document.matter_id
          ) idx
          WHERE (${searchScopeSql})
        `,
        [input.tenantId, batchId, parsed.documentIds, ...searchDecision.scope.params],
      )) as { rowCount: number | null };
      if (insertedItems.rowCount !== parsed.documentIds.length) throw notFoundDenied();
      await this.auditService.log(
        documentBulkActionCreatedAudit({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          batchId,
          actionKind: parsed.action.kind,
          itemCount: parsed.documentIds.length,
          requestHash,
        }),
        tx,
      );
      await enqueue(
        {
          batchId,
          tenantId: input.tenantId,
          tenantSlug: input.tenantSlug,
          actorUserId: input.actorUserId,
        },
        tx,
      );
      return this.readBatch(tx, input.tenantId, input.actorUserId, batchId);
    });
  }

  getBatch(input: {
    actorUserId: string;
    batchId: string;
    tenantId: TenantId;
  }): Promise<DocumentBulkActionBatchDto> {
    return this.auditService.transaction(input.tenantId, (tx) =>
      this.readBatch(tx, input.tenantId, input.actorUserId, input.batchId),
    );
  }

  async retryBatch(
    input: {
      actorUserId: string;
      batchId: string;
      body: unknown;
      tenantId: TenantId;
      tenantSlug: string;
    },
    enqueue: DocumentBulkActionEnqueue,
  ): Promise<DocumentBulkActionBatchDto> {
    const parsed = parseRetryBody(input.body);
    return this.auditService.transaction(input.tenantId, async (tx) => {
      const batch = await this.findBatch(
        tx,
        input.tenantId,
        input.actorUserId,
        input.batchId,
        true,
      );
      if (!batch) throw notFoundDenied();
      const failedItems = await this.findFailedItems(
        tx,
        input.tenantId,
        input.batchId,
        parsed.itemIds,
      );
      if (
        failedItems.length === 0 ||
        (parsed.itemIds && failedItems.length !== parsed.itemIds.length)
      ) {
        throw validationFailed('BULK_ACTION_RETRY_NOT_AVAILABLE');
      }
      if (failedItems.some((item) => item.retry_count >= 5)) {
        throw validationFailed('BULK_ACTION_RETRY_LIMIT');
      }

      const itemIds = failedItems.map((item) => item.batch_item_id);
      await tx.query(
        `
          UPDATE document_bulk_action_items
          SET status = 'queued',
              error_code = NULL,
              reason_code = NULL,
              retry_count = retry_count + 1,
              started_at = NULL,
              completed_at = NULL,
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND batch_item_id = ANY($3::uuid[])
            AND status = 'failed'
        `,
        [input.tenantId, input.batchId, itemIds],
      );
      const counts = await this.itemCounts(tx, input.tenantId, input.batchId);
      await tx.query(
        `
          UPDATE document_bulk_action_batches
          SET status = 'queued',
              succeeded_count = $3,
              failed_count = $4,
              completed_at = NULL,
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
        `,
        [input.tenantId, input.batchId, counts.succeeded, counts.failed],
      );
      await this.auditService.log(
        documentBulkActionRetriedAudit({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          batchId: input.batchId,
          actionKind: batch.action_kind,
          itemCount: itemIds.length,
          retryCount: Math.max(...failedItems.map((item) => item.retry_count + 1)),
        }),
        tx,
      );
      await enqueue(
        {
          batchId: input.batchId,
          tenantId: input.tenantId,
          tenantSlug: input.tenantSlug,
          actorUserId: input.actorUserId,
        },
        tx,
      );
      return this.readBatch(tx, input.tenantId, input.actorUserId, input.batchId);
    });
  }

  claimBatch(payload: DocumentBulkActionJobDto): Promise<ClaimedDocumentBulkActionBatch> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const batch = await this.findBatch(
        tx,
        payload.tenantId as TenantId,
        payload.actorUserId,
        payload.batchId,
        true,
      );
      if (!batch) throw notFoundDenied();
      const claimed = (await tx.query(
        `
          UPDATE document_bulk_action_items
          SET status = 'running',
              started_at = COALESCE(started_at, now()),
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND status IN ('queued', 'running')
          RETURNING batch_item_id, document_id
        `,
        [payload.tenantId, payload.batchId],
      )) as {
        rows: Array<{ batch_item_id: string; document_id: string }>;
        rowCount: number | null;
      };
      if (claimed.rows.length > 0) {
        await tx.query(
          `
            UPDATE document_bulk_action_batches
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            WHERE tenant_id = $1
              AND batch_id = $2
              AND status IN ('queued', 'running')
          `,
          [payload.tenantId, payload.batchId],
        );
      }
      return {
        action: actionFromRow(batch),
        items: claimed.rows.map((item) => ({
          itemId: item.batch_item_id,
          documentId: item.document_id,
        })),
      };
    });
  }

  recordItemResult(
    payload: DocumentBulkActionJobDto,
    itemId: string,
    result: { errorCode: ErrorCode; reasonCode?: string } | { succeeded: true },
  ): Promise<void> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const succeeded = 'succeeded' in result;
      await tx.query(
        `
          UPDATE document_bulk_action_items
          SET status = $4,
              error_code = $5,
              reason_code = $6,
              completed_at = now(),
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND batch_item_id = $3
            AND status = 'running'
        `,
        [
          payload.tenantId,
          payload.batchId,
          itemId,
          succeeded ? 'succeeded' : 'failed',
          succeeded ? null : result.errorCode,
          succeeded ? null : (result.reasonCode ?? null),
        ],
      );
      const counts = await this.itemCounts(tx, payload.tenantId as TenantId, payload.batchId);
      await tx.query(
        `
          UPDATE document_bulk_action_batches
          SET succeeded_count = $3,
              failed_count = $4,
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
        `,
        [payload.tenantId, payload.batchId, counts.succeeded, counts.failed],
      );
    });
  }

  finalizeBatch(payload: DocumentBulkActionJobDto): Promise<void> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const batch = await this.findBatch(
        tx,
        payload.tenantId as TenantId,
        payload.actorUserId,
        payload.batchId,
        true,
      );
      if (!batch) throw notFoundDenied();
      if (['completed', 'partial', 'failed'].includes(batch.status)) return;
      const counts = await this.itemCounts(tx, payload.tenantId as TenantId, payload.batchId);
      if (counts.pending > 0) return;
      const status: 'completed' | 'failed' | 'partial' =
        counts.failed === 0 ? 'completed' : counts.succeeded === 0 ? 'failed' : 'partial';
      await tx.query(
        `
          UPDATE document_bulk_action_batches
          SET status = $3,
              succeeded_count = $4,
              failed_count = $5,
              completed_at = now(),
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND status IN ('queued', 'running')
        `,
        [payload.tenantId, payload.batchId, status, counts.succeeded, counts.failed],
      );
      await this.auditService.log(
        documentBulkActionCompletedAudit({
          tenantId: payload.tenantId,
          actorUserId: payload.actorUserId,
          batchId: payload.batchId,
          actionKind: batch.action_kind,
          itemCount: batch.total_count,
          succeededCount: counts.succeeded,
          failedCount: counts.failed,
          status,
        }),
        tx,
      );
    });
  }

  async markDeadLetter(payload: DocumentBulkActionJobDto): Promise<void> {
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      await tx.query(
        `
          UPDATE document_bulk_action_items
          SET status = 'failed',
              error_code = 'VALIDATION_FAILED',
              reason_code = 'BULK_ACTION_WORKER_EXHAUSTED',
              completed_at = now(),
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND status IN ('queued', 'running')
        `,
        [payload.tenantId, payload.batchId],
      );
    });
    await this.finalizeBatch(payload);
  }

  private async readBatch(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    batchId: string,
  ): Promise<DocumentBulkActionBatchDto> {
    const batch = await this.findBatch(client, tenantId, actorUserId, batchId, false);
    if (!batch) throw notFoundDenied();
    const items = (await client.query(
      `
        SELECT
          batch_item_id,
          document_id,
          position,
          status,
          error_code,
          reason_code,
          retry_count,
          updated_at
        FROM document_bulk_action_items
        WHERE tenant_id = $1
          AND batch_id = $2
        ORDER BY position ASC
      `,
      [tenantId, batchId],
    )) as { rows: ItemRow[]; rowCount: number | null };
    return {
      batchId: batch.batch_id,
      receiptRef: batch.batch_id,
      action: actionFromRow(batch),
      status: batch.status,
      totalCount: batch.total_count,
      succeededCount: batch.succeeded_count,
      failedCount: batch.failed_count,
      createdAt: batch.created_at.toISOString(),
      updatedAt: batch.updated_at.toISOString(),
      receiptExpiresAt: batch.receipt_expires_at.toISOString(),
      items: items.rows.map(toItemDto),
    };
  }

  private async findBatch(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    batchId: string,
    lock: boolean,
  ): Promise<BatchRow | null> {
    const result = (await client.query(
      `
        SELECT
          batch_id,
          actor_user_id,
          action_kind,
          target_folder_id,
          target_tag,
          target_status,
          idempotency_key,
          request_hash,
          status,
          total_count,
          succeeded_count,
          failed_count,
          created_at,
          updated_at,
          receipt_expires_at
        FROM document_bulk_action_batches
        WHERE tenant_id = $1
          AND actor_user_id = $2
          AND batch_id = $3
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [tenantId, actorUserId, batchId],
    )) as { rows: BatchRow[]; rowCount: number | null };
    return result.rows[0] ?? null;
  }

  private async findByIdempotencyKey(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    idempotencyKey: string,
    lock: boolean,
  ): Promise<BatchRow | null> {
    const result = (await client.query(
      `
        SELECT
          batch_id,
          actor_user_id,
          action_kind,
          target_folder_id,
          target_tag,
          target_status,
          idempotency_key,
          request_hash,
          status,
          total_count,
          succeeded_count,
          failed_count,
          created_at,
          updated_at,
          receipt_expires_at
        FROM document_bulk_action_batches
        WHERE tenant_id = $1
          AND actor_user_id = $2
          AND idempotency_key = $3
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [tenantId, actorUserId, idempotencyKey],
    )) as { rows: BatchRow[]; rowCount: number | null };
    return result.rows[0] ?? null;
  }

  private async findFailedItems(
    client: QueryClient,
    tenantId: TenantId,
    batchId: string,
    itemIds: readonly string[] | undefined,
  ): Promise<ItemRow[]> {
    const result = (await client.query(
      `
        SELECT
          batch_item_id,
          document_id,
          position,
          status,
          error_code,
          reason_code,
          retry_count,
          updated_at
        FROM document_bulk_action_items
        WHERE tenant_id = $1
          AND batch_id = $2
          AND status = 'failed'
          AND ($3::uuid[] IS NULL OR batch_item_id = ANY($3::uuid[]))
        ORDER BY position ASC
        FOR UPDATE
      `,
      [tenantId, batchId, itemIds ?? null],
    )) as { rows: ItemRow[]; rowCount: number | null };
    return result.rows;
  }

  private async itemCounts(
    client: QueryClient,
    tenantId: TenantId,
    batchId: string,
  ): Promise<{ failed: number; pending: number; succeeded: number }> {
    const result = (await client.query(
      `
        SELECT
          count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
          count(*) FILTER (WHERE status = 'failed')::int AS failed,
          count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS pending
        FROM document_bulk_action_items
        WHERE tenant_id = $1
          AND batch_id = $2
      `,
      [tenantId, batchId],
    )) as {
      rows: Array<{ failed: number; pending: number; succeeded: number }>;
      rowCount: number | null;
    };
    return result.rows[0] ?? { failed: 0, pending: 0, succeeded: 0 };
  }
}
