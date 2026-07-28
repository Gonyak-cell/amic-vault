import { Inject, Injectable } from '@nestjs/common';
import {
  documentBulkActionJobSchema,
  type DocumentBulkActionJobDto,
  type TenantId,
} from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import { errorCodeFromUnknown } from './document-error.mapper';
import { DocumentBulkActionBatchService } from './document-bulk-action-batch.service';
import { DocumentBulkActionExecutor } from './document-bulk-action.executor';

@Injectable()
export class DocumentBulkActionJob {
  constructor(
    @Inject(DocumentBulkActionBatchService)
    private readonly batchService: DocumentBulkActionBatchService,
    @Inject(DocumentBulkActionExecutor)
    private readonly executor: DocumentBulkActionExecutor,
    @Inject(TenantContextService)
    private readonly tenantContext: TenantContextService,
  ) {}

  async process(payload: DocumentBulkActionJobDto): Promise<void> {
    const job = documentBulkActionJobSchema.parse(payload);
    const claimed = await this.batchService.claimBatch(job);
    for (const item of claimed.items) {
      let result: { succeeded: true } | { errorCode: ReturnType<typeof errorCodeFromUnknown> };
      try {
        await this.tenantContext.run(
          {
            tenantId: job.tenantId as TenantId,
            slug: job.tenantSlug,
            status: 'active',
            source: 'session',
          },
          () => this.executor.execute(job.actorUserId, item.documentId, claimed.action),
        );
        result = { succeeded: true };
      } catch (error) {
        result = { errorCode: errorCodeFromUnknown(error) };
      }
      await this.batchService.recordItemResult(job, item.itemId, result);
    }
    await this.batchService.finalizeBatch(job);
  }
}
