import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PermissionDecision, PreviewAccessSessionDto, TenantId } from '@amic-vault/shared';
import { createOpaqueToken, hashOpaqueToken } from '../auth/session.repository';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { documentViewedAudit } from '../audit/events/document-events';
import { promotedDocumentExistsSql } from '../file-security/promoted-file.guard';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

export interface PreviewSessionTarget {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  status: string;
  version_id: string;
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

interface PreviewSessionRow {
  preview_session_id: string;
  expires_at: Date;
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

@Injectable()
export class PreviewSessionService {
  private readonly logger = new Logger(PreviewSessionService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async issue(actorUserId: string, documentId: string): Promise<PreviewAccessSessionDto> {
    const context = this.tenantContext.require();
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const issued = await this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findCurrentTarget(tx, context.tenantId, documentId);
      if (!target) throw notFoundDenied();
      if (target.status === 'deleted') throw documentLocked();
      await this.assertCanPreview(context.tenantId, actorUserId, documentId);
      const inserted = await tx.query(
        `
          INSERT INTO preview_access_sessions (
            tenant_id, user_id, document_id, version_id, token_hash, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes')
          RETURNING preview_session_id, expires_at
        `,
        [context.tenantId, actorUserId, target.document_id, target.version_id, tokenHash],
      );
      const row = inserted.rows[0] as PreviewSessionRow | undefined;
      if (!row) throw new Error('preview session insert returned no row');
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
      return row;
    });
    return {
      previewSessionId: issued.preview_session_id,
      expiresAt: issued.expires_at.toISOString(),
      token,
    };
  }

  async authorizeStream(
    actorUserId: string,
    documentId: string,
    previewSessionId: string,
    token: string,
  ): Promise<PreviewSessionTarget> {
    const context = this.tenantContext.require();
    const tokenHash = hashOpaqueToken(token);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findCurrentTarget(tx, context.tenantId, documentId);
      if (!target) throw notFoundDenied();
      if (target.status === 'deleted') throw documentLocked();
      await this.assertCanPreview(context.tenantId, actorUserId, documentId);
      const session = await tx.query(
        `
          SELECT preview_session_id
          FROM preview_access_sessions
          WHERE tenant_id = $1
            AND preview_session_id = $2
            AND user_id = $3
            AND document_id = $4
            AND version_id = $5
            AND token_hash = $6
            AND revoked_at IS NULL
            AND expires_at > now()
          LIMIT 1
        `,
        [
          context.tenantId,
          previewSessionId,
          actorUserId,
          target.document_id,
          target.version_id,
          tokenHash,
        ],
      );
      if (session.rowCount !== 1) throw notFoundDenied();
      return target;
    });
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
      this.logger.warn({ code: 'PERM_EVAL_ERROR' });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'DOCUMENT_LOCKED') throw documentLocked();
    throw notFoundDenied();
  }

  private async findCurrentTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<PreviewSessionTarget | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status,
          dv.version_id, dv.file_object_id, f.storage_uri, f.normalized_filename,
          f.mime_type, f.size_bytes::text, f.sha256
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND ${promotedDocumentExistsSql('d')}
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as PreviewSessionTarget | undefined) ?? null;
  }
}
