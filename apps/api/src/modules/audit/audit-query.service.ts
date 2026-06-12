import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import {
  type AuditAction,
  type AuditEventDto,
  type AuditEventListDto,
  type AuditExportQueryDto,
  type AuditExportResultDto,
  r2DocumentAuditActions,
  type AuditMetadata,
  type AuditQueryDto,
  type DocumentAuditEventDto,
  type DocumentAuditEventListDto,
  type DocumentAuditQueryDto,
  type PermissionDecision,
  type R2DocumentAuditAction,
  type TenantId,
} from '@amic-vault/shared';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { AuditService } from './audit.service';

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
  action: AuditAction;
  actor_type: 'user' | 'system';
  actor_id: string | null;
  session_id: string | null;
  result: 'success' | 'denied' | 'failure';
  target_type: string;
  target_id: string | null;
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

type ResolvedAuditQuery = Omit<AuditQueryDto, 'cursor'> & {
  cursor: DecodedCursor | null;
};

type ResolvedAuditExportQuery = Omit<AuditExportQueryDto, 'cursor'> & {
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

function filterRefs(query: AuditQueryDto | AuditExportQueryDto): string {
  const refs: string[] = [];
  if (query.actorId) refs.push(`actor_id:${query.actorId}`);
  if (query.action) refs.push(`action:${query.action}`);
  if (query.result) refs.push(`result:${query.result}`);
  if (query.targetType) refs.push(`target_type:${query.targetType}`);
  if (query.targetId) refs.push(`target_id:${query.targetId}`);
  if (query.matterId) refs.push(`matter_id:${query.matterId}`);
  if (query.from || query.to) refs.push(`date_range:${query.from ?? ''}..${query.to ?? ''}`);
  refs.push(`limit:${query.limit}`);
  return (refs.join('|') || 'none').slice(0, 256);
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function auditEventsCsv(rows: readonly AuditEventDto[]): string {
  const header = [
    'event_id',
    'created_at',
    'action',
    'result',
    'actor_type',
    'actor_id',
    'target_type',
    'target_id',
    'matter_id',
    'session_id',
  ];
  const lines = rows.map((row) =>
    [
      row.eventId,
      row.createdAt,
      row.action,
      row.result,
      row.actorType,
      row.actorId,
      row.targetType,
      row.targetId,
      row.matterId,
      row.sessionId,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AuditService) private readonly auditService: AuditService,
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

  async listTenantEvents(actorUserId: string, query: AuditQueryDto): Promise<AuditEventListDto> {
    const context = this.tenantContext.require();
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw permissionDenied();
    await this.assertTargetFiltersTenantScoped(context.tenantId, query);

    const startedAt = Date.now();
    const rows = await this.findTenantAuditEvents(context.tenantId, { ...query, cursor });
    const visible = rows.slice(0, query.limit).map(mapTenantAuditRow);
    await this.auditService.log({
      tenantId: context.tenantId,
      actorId: actorUserId,
      action: 'AUDIT_QUERY_EXECUTED',
      targetType: 'audit_console',
      metadata: {
        scope_type: 'tenant_audit',
        filter_refs: filterRefs(query),
        result_count: visible.length,
        duration_ms: Date.now() - startedAt,
      },
    });

    return {
      items: visible,
      nextCursor: rows.length > query.limit ? encodeCursor(rows[query.limit - 1]!) : null,
    };
  }

  async exportTenantEvents(
    actorUserId: string,
    query: AuditExportQueryDto,
  ): Promise<AuditExportResultDto> {
    const context = this.tenantContext.require();
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw permissionDenied();
    await this.assertTargetFiltersTenantScoped(context.tenantId, query);

    const startedAt = Date.now();
    const rows = await this.findTenantAuditEvents(context.tenantId, { ...query, cursor });
    const visible = rows.slice(0, query.limit).map(mapTenantAuditRow);
    await this.auditService.log({
      tenantId: context.tenantId,
      actorId: actorUserId,
      action: 'AUDIT_EXPORT_CREATED',
      targetType: 'audit_export',
      metadata: {
        scope_type: 'tenant_audit',
        export_format: 'csv',
        filter_refs: filterRefs(query),
        result_count: visible.length,
        duration_ms: Date.now() - startedAt,
      },
    });

    return { csv: auditEventsCsv(visible), rowCount: visible.length };
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
          session_id, matter_id, metadata_json, created_at
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

  protected async findTenantAuditEvents(
    tenantId: TenantId,
    query: ResolvedAuditQuery | ResolvedAuditExportQuery,
  ): Promise<AuditEventRow[]> {
    const result = await getPool().query<AuditEventRow>(
      `
        SELECT event_id, action, actor_type, actor_id, session_id, result, target_type,
          target_id, matter_id, metadata_json, created_at
        FROM audit_events
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR actor_id = $2)
          AND ($3::text IS NULL OR action = $3)
          AND ($4::text IS NULL OR result = $4)
          AND ($5::text IS NULL OR target_type = $5)
          AND ($6::uuid IS NULL OR target_id = $6)
          AND ($7::uuid IS NULL OR matter_id = $7)
          AND ($8::timestamptz IS NULL OR created_at >= $8)
          AND ($9::timestamptz IS NULL OR created_at <= $9)
          AND (
            $10::timestamptz IS NULL
            OR (created_at, event_id) < ($10::timestamptz, $11::uuid)
          )
        ORDER BY created_at DESC, event_id DESC
        LIMIT $12
      `,
      [
        tenantId,
        query.actorId ?? null,
        query.action ?? null,
        query.result ?? null,
        query.targetType ?? null,
        query.targetId ?? null,
        query.matterId ?? null,
        query.from ?? null,
        query.to ?? null,
        query.cursor?.createdAt.toISOString() ?? null,
        query.cursor?.eventId ?? null,
        query.limit + 1,
      ],
    );
    return result.rows;
  }

  protected async assertTargetFiltersTenantScoped(
    tenantId: TenantId,
    query: Pick<AuditQueryDto | AuditExportQueryDto, 'matterId' | 'targetType' | 'targetId'>,
  ): Promise<void> {
    if (query.matterId) {
      await this.assertResourceInTenant(tenantId, 'matters', 'matter_id', query.matterId);
    }
    if (!query.targetId || !query.targetType) return;

    const target = targetTable(query.targetType);
    if (!target) throw permissionDenied();
    await this.assertResourceInTenant(tenantId, target.table, target.column, query.targetId);
  }

  private async assertResourceInTenant(
    tenantId: TenantId,
    table: string,
    column: string,
    id: string,
  ): Promise<void> {
    const result = await getPool().query(
      `
        SELECT 1
        FROM ${table}
        WHERE tenant_id = $1
          AND ${column} = $2
        LIMIT 1
      `,
      [tenantId, id],
    );
    if ((result.rowCount ?? 0) === 0) throw permissionDenied();
  }
}

function mapAuditRow(row: AuditEventRow): DocumentAuditEventDto {
  return {
    eventId: row.event_id,
    action: row.action as R2DocumentAuditAction,
    actorType: row.actor_type,
    actorId: row.actor_id,
    result: row.result,
    targetType: 'document',
    targetId: row.target_id ?? '',
    matterId: row.matter_id,
    metadata: row.metadata_json,
    createdAt: row.created_at.toISOString(),
  };
}

function mapTenantAuditRow(row: AuditEventRow): AuditEventDto {
  return {
    eventId: row.event_id,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    sessionId: row.session_id,
    result: row.result,
    targetType: row.target_type,
    targetId: row.target_id,
    matterId: row.matter_id,
    metadata: row.metadata_json,
    createdAt: row.created_at.toISOString(),
  };
}

function targetTable(targetType: string): { table: string; column: string } | null {
  if (targetType === 'auth' || targetType === 'user') return { table: 'users', column: 'user_id' };
  if (targetType === 'break_glass_request') {
    return { table: 'break_glass_requests', column: 'request_id' };
  }
  if (targetType === 'client') return { table: 'clients', column: 'client_id' };
  if (targetType === 'dlp_finding') return { table: 'dlp_findings', column: 'finding_id' };
  if (targetType === 'document') return { table: 'documents', column: 'document_id' };
  if (targetType === 'email') return { table: 'email_messages', column: 'email_id' };
  if (targetType === 'ethical_wall') return { table: 'ethical_walls', column: 'wall_id' };
  if (targetType === 'matter') return { table: 'matters', column: 'matter_id' };
  if (targetType === 'party') return { table: 'parties', column: 'party_id' };
  return null;
}
