import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import {
  r2DocumentAuditActions,
  type AuditMetadata,
  type DocumentAuditEventDto,
  type DocumentAuditEventListDto,
  type DocumentAuditQueryDto,
  type PermissionDecision,
  type R2DocumentAuditAction,
  type TenantId,
} from '@amic-vault/shared';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface AuditDocumentTargetRow {
  documentId: string;
  matterId: string;
}

interface AuditEventRow {
  event_id: string;
  action: R2DocumentAuditAction;
  actor_type: 'user' | 'system';
  actor_id: string | null;
  result: 'success' | 'denied' | 'failure';
  target_type: 'document';
  target_id: string;
  matter_id: string | null;
  metadata_json: AuditMetadata;
  created_at: Date;
}

interface DecodedCursor {
  createdAt: Date;
  eventId: string;
}

type ResolvedDocumentAuditQuery = Omit<DocumentAuditQueryDto, 'cursor'> & {
  cursor: DecodedCursor | null;
};

function permissionDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function encodeCursor(row: AuditEventRow): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.event_id}`, 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [createdAtValue, eventId] = decoded.split('|');
    const createdAt = new Date(createdAtValue ?? '');
    if (!eventId || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, eventId };
  } catch {
    return null;
  }
}

@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(PermissionService)
    private readonly permissionService: Pick<PermissionService, 'canReadDocumentAudit'>,
  ) {}

  async listDocumentEvents(
    actorUserId: string,
    documentId: string,
    query: DocumentAuditQueryDto,
  ): Promise<DocumentAuditEventListDto> {
    const context = this.tenantContext.require();
    const target = await this.findDocumentTarget(context.tenantId, documentId);
    if (!target) throw permissionDenied();
    await this.assertCanReadDocumentAudit(context.tenantId, actorUserId, target.matterId);

    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw permissionDenied();

    const rows = await this.findDocumentAuditEvents(context.tenantId, target.documentId, {
      eventType: query.eventType,
      from: query.from,
      to: query.to,
      limit: query.limit,
      cursor,
    });
    const visible = rows.slice(0, query.limit);
    return {
      items: visible.map(mapAuditRow),
      nextCursor: rows.length > query.limit ? encodeCursor(visible[visible.length - 1]!) : null,
    };
  }

  protected async findDocumentTarget(
    tenantId: TenantId,
    documentId: string,
  ): Promise<AuditDocumentTargetRow | null> {
    const result = await getPool().query<{
      document_id: string;
      matter_id: string;
    }>(
      `
        SELECT document_id, matter_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    const row = result.rows[0];
    return row ? { documentId: row.document_id, matterId: row.matter_id } : null;
  }

  protected async assertCanReadDocumentAudit(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadDocumentAudit(
        { tenantId, userId: actorUserId },
        matterId,
      );
    } catch {
      throw permissionDenied();
    }
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  protected async findDocumentAuditEvents(
    tenantId: TenantId,
    documentId: string,
    query: ResolvedDocumentAuditQuery,
  ): Promise<AuditEventRow[]> {
    const result = await getPool().query<AuditEventRow>(
      `
        SELECT event_id, action, actor_type, actor_id, result, target_type, target_id,
          matter_id, metadata_json, created_at
        FROM audit_events
        WHERE tenant_id = $1
          AND target_type = 'document'
          AND target_id = $2
          AND action = ANY($9::text[])
          AND ($3::text IS NULL OR action = $3)
          AND ($4::timestamptz IS NULL OR created_at >= $4)
          AND ($5::timestamptz IS NULL OR created_at <= $5)
          AND (
            $6::timestamptz IS NULL
            OR (created_at, event_id) < ($6::timestamptz, $7::uuid)
          )
        ORDER BY created_at DESC, event_id DESC
        LIMIT $8
      `,
      [
        tenantId,
        documentId,
        query.eventType ?? null,
        query.from ?? null,
        query.to ?? null,
        query.cursor?.createdAt.toISOString() ?? null,
        query.cursor?.eventId ?? null,
        query.limit + 1,
        r2DocumentAuditActions,
      ],
    );
    return result.rows;
  }
}

function mapAuditRow(row: AuditEventRow): DocumentAuditEventDto {
  return {
    eventId: row.event_id,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    result: row.result,
    targetType: row.target_type,
    targetId: row.target_id,
    matterId: row.matter_id,
    metadata: row.metadata_json,
    createdAt: row.created_at.toISOString(),
  };
}
