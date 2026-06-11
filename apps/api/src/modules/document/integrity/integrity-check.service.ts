import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../storage/storage.service';

export interface AssertObjectIntegrityInput {
  tenantId: string;
  actorUserId: string | null;
  matterId: string;
  documentId: string;
  storageUri: string;
  expectedSha256: string;
}

function documentLocked(): ForbiddenException {
  return new ForbiddenException({ code: 'DOCUMENT_LOCKED' });
}

@Injectable()
export class IntegrityCheckService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  async assertObjectMatchesHash(input: AssertObjectIntegrityInput): Promise<void> {
    let actualSha256: string;
    try {
      actualSha256 = await this.storageService.sha256ByStorageUri(input.tenantId, input.storageUri);
    } catch {
      await this.recordAlert(input, 'unavailable');
      throw documentLocked();
    }

    if (actualSha256 === input.expectedSha256) return;
    await this.recordAlert(input, actualSha256);
    throw documentLocked();
  }

  private async recordAlert(
    input: AssertObjectIntegrityInput,
    actualSha256: string,
  ): Promise<void> {
    this.metrics.recordDocumentIntegrityAlert();
    await this.auditService.log({
      tenantId: input.tenantId,
      actorId: input.actorUserId,
      action: 'DOCUMENT_INTEGRITY_ALERT',
      targetType: 'document',
      targetId: input.documentId,
      matterId: input.matterId,
      result: 'failure',
      metadata: {
        document_id: input.documentId,
        matter_id: input.matterId,
        before_ref: `sha256:${input.expectedSha256}`,
        after_ref: `sha256:${actualSha256}`,
        hash: input.expectedSha256,
      },
    });
  }
}
