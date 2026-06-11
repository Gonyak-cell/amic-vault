import { Inject, Injectable } from '@nestjs/common';
import {
  bulkUploadJobSchema,
  bulkUploadQueueName,
  type BulkUploadJobDto,
  type BulkUploadReportDto,
  type TenantId,
} from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import { DocumentUploadService } from './document-upload.service';
import { errorCodeFromUnknown } from './document-error.mapper';

@Injectable()
export class BulkUploadJob {
  static readonly queueName = bulkUploadQueueName;

  constructor(
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async process(job: BulkUploadJobDto): Promise<BulkUploadReportDto> {
    const parsed = bulkUploadJobSchema.parse(job);
    const items = [];

    for (const item of parsed.items) {
      try {
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
              file: item.file,
            }),
        );
        items.push({ itemId: item.itemId, status: 'success' as const, document });
      } catch (error) {
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
