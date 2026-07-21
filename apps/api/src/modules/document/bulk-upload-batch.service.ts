import { BadRequestException, Injectable } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import {
  bulkUploadJobSchema,
  registerBulkUploadBatchSchema,
  retryBulkUploadBatchItemSchema,
  type BulkUploadBatchDto,
  type BulkUploadBatchItemDto,
  type BulkUploadBatchItemStatus,
  type BulkUploadBatchStatus,
  type BulkUploadJobDto,
  type BulkUploadReportDto,
  type ErrorCode,
  type RegisterBulkUploadBatchDto,
  type RetryBulkUploadBatchItemDto,
  type TenantId,
} from '@amic-vault/shared';
import { DatabaseService } from '../../common/db/database.service';

export type BulkUploadEnqueue = (payload: BulkUploadJobDto, client: PoolClient) => Promise<string>;

interface BatchRow {
  batch_id: string;
  matter_id: string;
  status: BulkUploadBatchStatus;
  total_items: number;
  pending_items: string;
  uploaded_items: string;
  failed_items: string;
  duplicate_items: string;
  done_items: string;
  created_at: Date;
  updated_at: Date;
}

interface BatchItemRow {
  batch_item_id: string;
  item_id: string;
  status: BulkUploadBatchItemStatus;
  original_filename: string;
  size_bytes: string;
  document_id: string | null;
  file_object_id: string | null;
  error_code: ErrorCode | null;
  error_reason: string | null;
  retry_count: number;
  updated_at: Date;
}

interface RetryItemRow {
  item_id: string;
  status: BulkUploadBatchItemStatus;
  matter_id: string;
  actor_user_id: string;
  file_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  fields_json: Record<string, unknown>;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function assertUniqueItemIds(items: RegisterBulkUploadBatchDto['items']): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.itemId)) throw validationFailed('DUPLICATE_BATCH_ITEM_ID');
    seen.add(item.itemId);
  }
}

function parseRegisterBody(body: unknown): RegisterBulkUploadBatchDto {
  const parsed = registerBulkUploadBatchSchema.safeParse(body ?? {});
  if (!parsed.success) throw validationFailed();
  return parsed.data;
}

function parseRetryBody(body: unknown): RetryBulkUploadBatchItemDto {
  const parsed = retryBulkUploadBatchItemSchema.safeParse(body ?? {});
  if (!parsed.success) throw validationFailed();
  return parsed.data;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

@Injectable()
export class BulkUploadBatchService {
  constructor(private readonly databaseService: DatabaseService) {}

  async registerBatch(
    input: {
      actorUserId: string;
      matterId: string;
      tenantId: TenantId;
      tenantSlug: string;
      body: unknown;
    },
    enqueue: BulkUploadEnqueue,
  ): Promise<BulkUploadBatchDto> {
    const parsed = parseRegisterBody(input.body);
    assertUniqueItemIds(parsed.items);
    return this.transaction(input.tenantId, async (client) => {
      const batchId = await this.insertBatch(client, input, parsed);
      for (const [chunkIndex, batchItems] of chunks(parsed.items, 100).entries()) {
        const payload = bulkUploadJobSchema.parse({
          batchId,
          chunkIndex,
          items: batchItems.map((item) => ({
            itemId: item.itemId,
            tenantId: input.tenantId,
            tenantSlug: input.tenantSlug,
            actorUserId: input.actorUserId,
            matterId: input.matterId,
            fields: item.fields,
            file: item.file,
          })),
        });
        const jobId = await enqueue(payload, client);
        await client.query(
          `
            UPDATE bulk_upload_batch_items
            SET status = 'uploaded',
                job_id = $4,
                updated_at = now()
            WHERE tenant_id = $1
              AND batch_id = $2
              AND item_id = ANY($3::text[])
          `,
          [input.tenantId, batchId, batchItems.map((item) => item.itemId), jobId],
        );
      }
      await client.query(
        `
          UPDATE bulk_upload_batches
          SET status = 'processing',
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
        `,
        [input.tenantId, batchId],
      );
      return this.selectBatch(client, input.tenantId, input.actorUserId, batchId, input.matterId);
    });
  }

  async getBatch(input: {
    actorUserId: string;
    batchId: string;
    matterId: string;
    tenantId: TenantId;
  }): Promise<BulkUploadBatchDto> {
    return this.transaction(input.tenantId, (client) =>
      this.selectBatch(client, input.tenantId, input.actorUserId, input.batchId, input.matterId),
    );
  }

  async retryItem(
    input: {
      actorUserId: string;
      batchId: string;
      itemId: string;
      matterId: string;
      tenantId: TenantId;
      tenantSlug: string;
      body: unknown;
    },
    enqueue: BulkUploadEnqueue,
  ): Promise<BulkUploadBatchDto> {
    const parsed = parseRetryBody(input.body);
    return this.transaction(input.tenantId, async (client) => {
      const item = await this.selectRetryItem(client, input);
      const fields = parsed.fields ?? item.fields_json;
      const size = (await stat(item.file_path)).size;
      const payload = bulkUploadJobSchema.parse({
        batchId: input.batchId,
        chunkIndex: 0,
        items: [
          {
            itemId: item.item_id,
            tenantId: input.tenantId,
            tenantSlug: input.tenantSlug,
            actorUserId: item.actor_user_id,
            matterId: item.matter_id,
            fields,
            file: {
              path: item.file_path,
              originalname: item.original_filename,
              mimetype: item.mime_type,
              size,
            },
          },
        ],
      });
      const jobId = await enqueue(payload, client);
      await client.query(
        `
          UPDATE bulk_upload_batch_items
          SET status = 'uploaded',
              fields_json = $5::jsonb,
              error_code = NULL,
              error_reason = NULL,
              job_id = $6,
              size_bytes = $7,
              retry_count = retry_count + 1,
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND item_id = $3
            AND actor_user_id = $4
        `,
        [
          input.tenantId,
          input.batchId,
          input.itemId,
          input.actorUserId,
          JSON.stringify(fields),
          jobId,
          size,
        ],
      );
      await this.refreshBatchStatus(client, input.tenantId, input.batchId);
      return this.selectBatch(
        client,
        input.tenantId,
        input.actorUserId,
        input.batchId,
        input.matterId,
      );
    });
  }

  async recordJobReport(payload: BulkUploadJobDto, report: BulkUploadReportDto): Promise<void> {
    if (!payload.batchId) return;
    const parsed = bulkUploadJobSchema.parse(payload);
    const batchId = parsed.batchId;
    if (!batchId) return;
    const tenantId = parsed.items[0]?.tenantId as TenantId | undefined;
    if (!tenantId) return;
    await this.transaction(tenantId, async (client) => {
      for (const result of report.items) {
        if (result.status === 'success') {
          await client.query(
            `
              UPDATE bulk_upload_batch_items
              SET status = 'done',
                  document_id = $4,
                  file_object_id = $5,
                  error_code = NULL,
                  error_reason = NULL,
                  updated_at = now()
              WHERE tenant_id = $1
                AND batch_id = $2
                AND item_id = $3
            `,
            [
              tenantId,
              batchId,
              result.itemId,
              result.document.documentId,
              result.document.fileObjectId,
            ],
          );
          continue;
        }
        const status = result.status === 'duplicate' ? 'duplicate' : 'failed';
        await client.query(
          `
            UPDATE bulk_upload_batch_items
            SET status = $4,
                error_code = $5,
                error_reason = $6,
                updated_at = now()
            WHERE tenant_id = $1
              AND batch_id = $2
              AND item_id = $3
          `,
          [
            tenantId,
            batchId,
            result.itemId,
            status,
            result.code,
            result.status === 'duplicate' ? result.reason : null,
          ],
        );
      }
      await this.refreshBatchStatus(client, tenantId, batchId);
    });
  }

  async markJobDeadLetter(payload: BulkUploadJobDto): Promise<void> {
    if (!payload.batchId) return;
    const parsed = bulkUploadJobSchema.parse(payload);
    const batchId = parsed.batchId;
    if (!batchId) return;
    const tenantId = parsed.items[0]?.tenantId as TenantId | undefined;
    if (!tenantId) return;
    await this.transaction(tenantId, async (client) => {
      await client.query(
        `
          UPDATE bulk_upload_batch_items
          SET status = 'failed',
              error_code = 'VALIDATION_FAILED',
              error_reason = 'DEAD_LETTER',
              updated_at = now()
          WHERE tenant_id = $1
            AND batch_id = $2
            AND item_id = ANY($3::text[])
            AND status IN ('pending', 'uploaded')
        `,
        [tenantId, batchId, parsed.items.map((item) => item.itemId)],
      );
      await this.refreshBatchStatus(client, tenantId, batchId);
    });
  }

  private async transaction<T>(tenantId: TenantId, run: (client: PoolClient) => Promise<T>) {
    return this.databaseService.tenantTransaction(tenantId, run);
  }

  private async insertBatch(
    client: PoolClient,
    input: {
      actorUserId: string;
      matterId: string;
      tenantId: TenantId;
    },
    parsed: RegisterBulkUploadBatchDto,
  ): Promise<string> {
    const batchResult = await client.query<{ batch_id: string }>(
      `
        INSERT INTO bulk_upload_batches (
          tenant_id, matter_id, actor_user_id, total_items
        )
        VALUES ($1, $2, $3, $4)
        RETURNING batch_id
      `,
      [input.tenantId, input.matterId, input.actorUserId, parsed.items.length],
    );
    const batchId = batchResult.rows[0]?.batch_id;
    if (!batchId) throw new Error('bulk upload batch insert returned no id');
    for (const item of parsed.items) {
      await client.query(
        `
          INSERT INTO bulk_upload_batch_items (
            tenant_id, batch_id, item_id, matter_id, actor_user_id, file_path,
            original_filename, mime_type, size_bytes, fields_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          input.tenantId,
          batchId,
          item.itemId,
          input.matterId,
          input.actorUserId,
          item.file.path,
          item.file.originalname,
          item.file.mimetype,
          item.file.size,
          JSON.stringify(item.fields),
        ],
      );
    }
    return batchId;
  }

  private async selectBatch(
    client: PoolClient,
    tenantId: TenantId,
    actorUserId: string,
    batchId: string,
    matterId: string | null,
  ): Promise<BulkUploadBatchDto> {
    const batchResult = await client.query<BatchRow>(
      `
        SELECT b.batch_id, b.matter_id, b.status, b.total_items, b.created_at, b.updated_at,
          count(i.*) FILTER (WHERE i.status = 'pending')::text AS pending_items,
          count(i.*) FILTER (WHERE i.status = 'uploaded')::text AS uploaded_items,
          count(i.*) FILTER (WHERE i.status = 'failed')::text AS failed_items,
          count(i.*) FILTER (WHERE i.status = 'duplicate')::text AS duplicate_items,
          count(i.*) FILTER (WHERE i.status = 'done')::text AS done_items
        FROM bulk_upload_batches b
        LEFT JOIN bulk_upload_batch_items i
          ON i.tenant_id = b.tenant_id
         AND i.batch_id = b.batch_id
        WHERE b.tenant_id = $1
          AND b.actor_user_id = $2
          AND b.batch_id = $3
          AND ($4::uuid IS NULL OR b.matter_id = $4::uuid)
        GROUP BY b.batch_id
      `,
      [tenantId, actorUserId, batchId, matterId],
    );
    const batch = batchResult.rows[0];
    if (!batch) throw validationFailed();
    const itemResult = await client.query<BatchItemRow>(
      `
        SELECT batch_item_id, item_id, status, original_filename, size_bytes::text,
          document_id, file_object_id, error_code, error_reason, retry_count, updated_at
        FROM bulk_upload_batch_items
        WHERE tenant_id = $1
          AND batch_id = $2
        ORDER BY created_at ASC, batch_item_id ASC
      `,
      [tenantId, batchId],
    );
    return {
      batchId: batch.batch_id,
      matterId: batch.matter_id,
      status: batch.status,
      totalItems: batch.total_items,
      pendingItems: Number(batch.pending_items),
      uploadedItems: Number(batch.uploaded_items),
      failedItems: Number(batch.failed_items),
      duplicateItems: Number(batch.duplicate_items),
      doneItems: Number(batch.done_items),
      createdAt: toIso(batch.created_at),
      updatedAt: toIso(batch.updated_at),
      items: itemResult.rows.map(toBatchItemDto),
    };
  }

  private async selectRetryItem(
    client: PoolClient,
    input: {
      actorUserId: string;
      batchId: string;
      itemId: string;
      matterId: string;
      tenantId: TenantId;
    },
  ): Promise<RetryItemRow> {
    const result = await client.query<RetryItemRow>(
      `
        SELECT item_id, status, matter_id, actor_user_id, file_path, original_filename,
          mime_type, size_bytes::text, fields_json
        FROM bulk_upload_batch_items
        WHERE tenant_id = $1
          AND batch_id = $2
          AND item_id = $3
          AND actor_user_id = $4
          AND matter_id = $5
        FOR UPDATE
      `,
      [input.tenantId, input.batchId, input.itemId, input.actorUserId, input.matterId],
    );
    const item = result.rows[0];
    if (!item) throw validationFailed();
    if (item.status !== 'failed' && item.status !== 'duplicate') {
      throw validationFailed('BATCH_ITEM_NOT_RETRYABLE');
    }
    return item;
  }

  private async refreshBatchStatus(
    client: PoolClient,
    tenantId: TenantId,
    batchId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE bulk_upload_batches b
        SET status = CASE
              WHEN EXISTS (
                SELECT 1 FROM bulk_upload_batch_items i
                WHERE i.tenant_id = b.tenant_id
                  AND i.batch_id = b.batch_id
                  AND i.status IN ('pending', 'uploaded')
              ) THEN 'processing'
              WHEN EXISTS (
                SELECT 1 FROM bulk_upload_batch_items i
                WHERE i.tenant_id = b.tenant_id
                  AND i.batch_id = b.batch_id
                  AND i.status IN ('failed', 'duplicate')
              ) THEN 'failed'
              ELSE 'done'
            END,
            updated_at = now()
        WHERE b.tenant_id = $1
          AND b.batch_id = $2
      `,
      [tenantId, batchId],
    );
  }
}

function toBatchItemDto(row: BatchItemRow): BulkUploadBatchItemDto {
  return {
    batchItemId: row.batch_item_id,
    itemId: row.item_id,
    status: row.status,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    documentId: row.document_id,
    fileObjectId: row.file_object_id,
    errorCode: row.error_code,
    errorReason: row.error_reason,
    retryCount: row.retry_count,
    updatedAt: toIso(row.updated_at),
  };
}
