import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { SearchIndexingService } from './indexing.service';

type ReindexScopeType = 'tenant' | 'matter';

export interface ReindexRequestInput {
  scopeType: ReindexScopeType;
  scopeId?: string | null;
}

export interface ReindexRequestResult {
  accepted: true;
  scopeType: ReindexScopeType;
  scopeId: string;
  enqueuedJobCount: number;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

@Injectable()
export class ReindexService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchIndexingService) private readonly indexingService: SearchIndexingService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async requestReindex(actorUserId: string, input: ReindexRequestInput): Promise<ReindexRequestResult> {
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
        if (exists.rowCount !== 1) throw validationFailed('REINDEX_SCOPE_NOT_FOUND');
      }
      const jobIds = await this.indexingService.enqueueTenantOrMatterVersions(
        {
          tenantId: context.tenantId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
        },
        tx,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'SEARCH_REINDEX_REQUESTED',
          targetType: 'search_index',
          targetId: scope.scopeId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
          metadata: {
            scope_type: scope.scopeType,
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

  private normalizeScope(tenantId: string, input: ReindexRequestInput): ReindexRequestInput & { scopeId: string } {
    if (input.scopeType === 'tenant') return { scopeType: 'tenant', scopeId: tenantId };
    if (input.scopeType === 'matter' && input.scopeId) {
      return { scopeType: 'matter', scopeId: input.scopeId };
    }
    throw validationFailed('REINDEX_SCOPE_INVALID');
  }
}
