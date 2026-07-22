import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  previewSessionTokenSchema,
  type CreatePreviewSessionResponseDto,
  type PermissionDecision,
  type TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { documentViewedAudit } from '../audit/events/document-events';
import { createOpaqueToken, hashOpaqueToken } from '../auth/session.repository';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

const previewSessionTtlMs = 5 * 60 * 1000;

interface PreviewSessionTargetRow {
  document_id: string;
  matter_id: string;
  status: string;
  version_id: string;
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

@Injectable()
export class PreviewSessionService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async issue(actorUserId: string, documentId: string): Promise<CreatePreviewSessionResponseDto> {
    const context = this.tenantContext.require();
    try {
      return await this.auditService.transaction(context.tenantId, async (tx) => {
        const target = await this.findCurrentTarget(tx, context.tenantId, documentId);
        if (!target) throw notFoundDenied();
        if (target.status === 'deleted') throw documentLocked();
        await this.assertCanPreview(context.tenantId, actorUserId, documentId);

        const previewSessionToken = createOpaqueToken();
        const expiresAt = new Date(Date.now() + previewSessionTtlMs);
        await tx.query(
          `
            INSERT INTO preview_access_sessions (
              tenant_id, user_id, document_id, version_id, token_hash, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            context.tenantId,
            actorUserId,
            target.document_id,
            target.version_id,
            hashOpaqueToken(previewSessionToken),
            expiresAt,
          ],
        );
        await this.auditService.log(
          documentViewedAudit({
            tenantId: context.tenantId,
            actorId: actorUserId,
            documentId: target.document_id,
            matterId: target.matter_id,
            versionId: target.version_id,
            channel: 'preview',
          }),
          tx,
        );
        return { previewSessionToken, expiresAt: expiresAt.toISOString() };
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw notFoundDenied();
    }
  }

  async assertActiveSession(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
    versionId: string,
    previewSessionToken: string | undefined,
  ): Promise<void> {
    const parsedToken = previewSessionTokenSchema.safeParse(previewSessionToken);
    if (!parsedToken.success) throw notFoundDenied();
    const result = await client.query(
      `
        SELECT 1
        FROM preview_access_sessions
        WHERE tenant_id = $1
          AND user_id = $2
          AND document_id = $3
          AND version_id = $4
          AND token_hash = $5
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1
      `,
      [tenantId, actorUserId, documentId, versionId, hashOpaqueToken(parsedToken.data)],
    );
    if (result.rows.length === 1) return;
    throw notFoundDenied();
  }

  private async assertCanPreview(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadDocument(
        { tenantId, userId: actorUserId },
        documentId,
      );
    } catch {
      throw notFoundDenied();
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'DOCUMENT_LOCKED') throw documentLocked();
    throw notFoundDenied();
  }

  private async findCurrentTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<PreviewSessionTargetRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.matter_id, d.status, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as PreviewSessionTargetRow | undefined) ?? null;
  }
}
