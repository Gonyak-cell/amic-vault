import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { OcrQueueService } from './ocr-queue.service';

type OcrBackfillScopeType = 'tenant' | 'matter';

export interface OcrBackfillRequestInput {
  scopeType: OcrBackfillScopeType;
  scopeId?: string | null;
}

export interface OcrBackfillRequestResult {
  accepted: true;
  scopeType: OcrBackfillScopeType;
  scopeId: string;
  enqueuedJobCount: number;
}

interface OcrPendingRow {
  document_id: string;
  version_id: string;
  file_object_id: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

@Injectable()
export class OcrBackfillService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(OcrQueueService) private readonly ocrQueue: OcrQueueService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async requestBackfill(
    actorUserId: string,
    input: OcrBackfillRequestInput,
  ): Promise<OcrBackfillRequestResult> {
    const context = this.tenantContext.require();
    const scope = this.normalizeScope(context.tenantId, input);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      if (scope.scopeType === 'matter') {
        const exists = await tx.query(
          `
            SELECT matter_id
            FROM matters
            WHERE tenant_id = $1
              AND matter_id = $2
            LIMIT 1
          `,
          [context.tenantId, scope.scopeId],
        );
        if (exists.rowCount !== 1) throw validationFailed('OCR_BACKFILL_SCOPE_NOT_FOUND');
      }

      const params: unknown[] = [context.tenantId];
      const filters = [
        'cd.tenant_id = $1',
        "cd.extraction_status = 'ocr_pending'",
        "cd.extraction_method = 'ocr_required'",
        "dv.version_status = 'current'",
        "d.status <> 'deleted'",
      ];
      if (scope.scopeType === 'matter') {
        params.push(scope.scopeId);
        filters.push(`d.matter_id = $${params.length}`);
      }

      const result = await tx.query(
        `
          SELECT dv.document_id, dv.version_id, dv.file_object_id
          FROM canonical_documents cd
          JOIN document_versions dv
            ON dv.tenant_id = cd.tenant_id
            AND dv.version_id = cd.version_id
          JOIN documents d
            ON d.tenant_id = dv.tenant_id
            AND d.document_id = dv.document_id
          WHERE ${filters.join(' AND ')}
          ORDER BY cd.updated_at ASC, cd.version_id ASC
        `,
        params,
      );

      const rows = result.rows as OcrPendingRow[];
      const jobIds: string[] = [];
      for (const row of rows) {
        jobIds.push(
          await this.ocrQueue.enqueueOcrRequired(
            {
              tenantId: context.tenantId,
              documentId: row.document_id,
              versionId: row.version_id,
              fileObjectId: row.file_object_id,
            },
            tx,
          ),
        );
      }

      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'SEARCH_REINDEX_REQUESTED',
          targetType: 'search_index',
          targetId: scope.scopeId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
          metadata: {
            scope_type:
              scope.scopeType === 'matter' ? 'ocr_backfill_matter' : 'ocr_backfill_tenant',
            scope_id: scope.scopeId,
            enqueued_job_count: jobIds.length,
          },
        },
        tx,
      );

      return {
        accepted: true,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        enqueuedJobCount: jobIds.length,
      };
    });
  }

  private normalizeScope(
    tenantId: string,
    input: OcrBackfillRequestInput,
  ): OcrBackfillRequestInput & { scopeId: string } {
    if (input.scopeType === 'tenant') return { scopeType: 'tenant', scopeId: tenantId };
    if (input.scopeType === 'matter' && input.scopeId) {
      return { scopeType: 'matter', scopeId: input.scopeId };
    }
    throw validationFailed('OCR_BACKFILL_SCOPE_INVALID');
  }
}
