import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { TenantContextService } from '../tenant/tenant-context';
import { DocumentBulkActionBatchService } from './document-bulk-action-batch.service';
import { DocumentBulkActionQueueService } from './document-bulk-action-queue.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('document-bulk-action-batches')
export class DocumentBulkActionController {
  constructor(
    @Inject(DocumentBulkActionBatchService)
    private readonly batchService: DocumentBulkActionBatchService,
    @Inject(DocumentBulkActionQueueService)
    private readonly queueService: DocumentBulkActionQueueService,
    @Inject(TenantContextService)
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    const context = this.tenantContext.require();
    return this.batchService.createBatch(
      {
        actorUserId: sessionUserId(request),
        body,
        tenantId: context.tenantId,
        tenantSlug: context.slug,
      },
      (payload, client) => this.queueService.enqueue(payload, client),
    );
  }

  @Get(':batchId')
  get(@Req() request: RequestWithSession, @Param('batchId') batchId: string) {
    const context = this.tenantContext.require();
    return this.batchService.getBatch({
      actorUserId: sessionUserId(request),
      batchId: parseUuid(batchId),
      tenantId: context.tenantId,
    });
  }

  @Post(':batchId/retry')
  retry(
    @Req() request: RequestWithSession,
    @Param('batchId') batchId: string,
    @Body() body: unknown,
  ) {
    const context = this.tenantContext.require();
    return this.batchService.retryBatch(
      {
        actorUserId: sessionUserId(request),
        batchId: parseUuid(batchId),
        body,
        tenantId: context.tenantId,
        tenantSlug: context.slug,
      },
      (payload, client) => this.queueService.enqueue(payload, client),
    );
  }
}
