import { copyFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  bulkUploadJobSchema,
  bulkUploadQueueName,
  type BulkUploadJobDto,
  type BulkUploadJobItemDto,
  type BulkUploadItemResultDto,
  type BulkUploadReportDto,
  type TenantId,
} from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import { DocumentUploadService } from './document-upload.service';
import { errorCodeFromUnknown } from './document-error.mapper';
import { ZipChildDocumentService } from './zip-child-document.service';

@Injectable()
export class BulkUploadJob {
  static readonly queueName = bulkUploadQueueName;

  constructor(
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(ZipChildDocumentService) private readonly zipChildService: ZipChildDocumentService,
  ) {}

  async process(job: BulkUploadJobDto): Promise<BulkUploadReportDto> {
    const parsed = bulkUploadJobSchema.parse(job);
    const items: BulkUploadItemResultDto[] = [];

    for (const item of parsed.items) {
      try {
        const file = parsed.batchId ? await batchAttemptFile(item) : item.file;
        const document = await this.tenantContext.run(
          {
            tenantId: item.tenantId as TenantId,
            slug: item.tenantSlug,
            status: 'active',
            source: 'session',
          },
          () =>
            this.uploadService.upload({
              actorUserId: item.actorUserId,
              matterId: item.matterId,
              fields: item.fields,
              file,
            }),
        );
        if (parsed.batchId) {
          await this.tenantContext.run(
            {
              tenantId: item.tenantId as TenantId,
              slug: item.tenantSlug,
              status: 'active',
              source: 'session',
            },
            () =>
              this.zipChildService.registerChildren({
                tenantId: item.tenantId as TenantId,
                actorUserId: item.actorUserId,
                matterId: item.matterId,
                batchId: parsed.batchId ?? null,
                batchItemId: item.itemId,
                parentDocumentId: document.documentId,
                zipFilePath: item.file.path,
                originalFilename: item.file.originalname,
                fields: item.fields,
              }),
          );
        }
        items.push({ itemId: item.itemId, status: 'success' as const, document });
        if (parsed.batchId) await unlink(item.file.path).catch(() => undefined);
      } catch (error) {
        if (duplicateDecisionRequired(error)) {
          items.push({
            itemId: item.itemId,
            status: 'duplicate' as const,
            code: 'VALIDATION_FAILED',
            reason: 'DUPLICATE_DECISION_REQUIRED',
          });
          continue;
        }
        items.push({
          itemId: item.itemId,
          status: 'failed' as const,
          code: errorCodeFromUnknown(error),
        });
      }
    }

    const failed = items.filter((item) => item.status === 'failed').length;
    return {
      queueName: BulkUploadJob.queueName,
      total: items.length,
      succeeded: items.length - failed,
      failed,
      items,
    };
  }
}

async function batchAttemptFile(item: BulkUploadJobItemDto): Promise<BulkUploadJobItemDto['file']> {
  const path = `${item.file.path}.${randomUUID()}.attempt`;
  await copyFile(item.file.path, path);
  return { ...item.file, path };
}

function duplicateDecisionRequired(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'reason' in response &&
    response.reason === 'DUPLICATE_DECISION_REQUIRED'
  );
}
