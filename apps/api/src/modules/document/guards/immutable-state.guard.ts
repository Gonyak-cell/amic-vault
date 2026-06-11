import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isDocumentStatus, isMatterMutationBlockedState, isMatterState } from '@amic-vault/domain';
import type { TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { TenantContextService } from '../../tenant/tenant-context';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export interface ImmutableStateSnapshot {
  documentStatus: string;
  matterStatus: string;
}

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string | undefined>;
}

interface DocumentStateRow {
  status: string;
  matter_status: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function documentLocked(reason: string): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED', reason });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function documentIdFromRequest(request: RequestLike): string | undefined {
  const param = request.params?.documentId;
  if (param) return param;
  const url = request.originalUrl ?? request.url ?? '';
  return /\/documents\/([0-9a-f-]{36})(?:\/|$)/i.exec(url)?.[1];
}

export function isDocumentImmutableStatus(status: string): boolean {
  return status === 'archived' || status === 'disposal_locked' || status === 'deleted';
}

export function assertDocumentMutationAllowed(
  snapshot: ImmutableStateSnapshot,
  options: { allowDeletedNoop?: boolean } = {},
): void {
  if (!isDocumentStatus(snapshot.documentStatus)) throw validationFailed();
  if (!isMatterState(snapshot.matterStatus)) throw validationFailed();
  if (isMatterMutationBlockedState(snapshot.matterStatus)) {
    throw validationFailed('MATTER_MUTATION_BLOCKED');
  }
  if (snapshot.documentStatus === 'deleted' && options.allowDeletedNoop) return;
  if (isDocumentImmutableStatus(snapshot.documentStatus)) {
    throw documentLocked('DOCUMENT_IMMUTABLE_STATE');
  }
}

@Injectable()
export class ImmutableStateGuard implements CanActivate {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const documentId = documentIdFromRequest(request);
    if (!documentId || !uuidPattern.test(documentId)) return true;
    const tenant = this.tenantContext.require();
    const row = await this.auditService.transaction(tenant.tenantId, (tx) =>
      findDocumentState(tx, tenant.tenantId, documentId),
    );
    if (!row) throw notFoundDenied();
    assertDocumentMutationAllowed(
      { documentStatus: row.status, matterStatus: row.matter_status },
      { allowDeletedNoop: request.method === 'DELETE' },
    );
    return true;
  }
}

async function findDocumentState(
  client: QueryClient,
  tenantId: TenantId,
  documentId: string,
): Promise<DocumentStateRow | null> {
  const result = await client.query(
    `
      SELECT d.status, m.status AS matter_status
      FROM documents d
      JOIN matters m
        ON m.tenant_id = d.tenant_id
        AND m.matter_id = d.matter_id
      WHERE d.tenant_id = $1
        AND d.document_id = $2
      LIMIT 1
    `,
    [tenantId, documentId],
  );
  return (result.rows[0] as DocumentStateRow | undefined) ?? null;
}
