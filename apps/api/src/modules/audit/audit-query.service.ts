import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildSafeLabel,
  type AuditAction,
  type AuditEventDto,
  type AuditEventListDto,
  type AuditExportQueryDto,
  type AuditExportResultDto,
  documentTimelineAuditActions,
  type AuditMetadata,
  type AuditQueryDto,
  type DocumentAuditEventDto,
  type DocumentAuditEventListDto,
  type DocumentAuditQueryDto,
  type DocumentAuditQueryEventType,
  type MatterAuditQueryDto,
  type PermissionDecision,
  type TenantId,
} from '@amic-vault/shared';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { AuditService, type QueryClient } from './audit.service';

interface AuditDocumentTargetRow {
  documentId: string;
  matterId: string;
}

interface AuditEventRow {
  event_id: string;
  action: AuditAction;
  actor_type: 'user' | 'system';
  actor_id: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  session_id: string | null;
  result: 'success' | 'denied' | 'failure';
  target_type: string;
  target_id: string | null;
  target_display_name?: string | null;
  target_display_code?: string | null;
  matter_id: string | null;
  matter_display_name?: string | null;
  matter_display_code?: string | null;
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

type ResolvedMatterAuditQuery = Omit<MatterAuditQueryDto, 'cursor'> & {
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
    return this.auditService.transaction(context.tenantId, async (client) => {
      const target = await this.findDocumentTarget(client, context.tenantId, documentId);
      if (!target) throw permissionDenied();
      await this.assertCanReadDocumentAudit(context.tenantId, actorUserId, target.matterId);

      const cursor = decodeCursor(query.cursor);
      if (query.cursor && !cursor) throw permissionDenied();

      const rows = await this.findDocumentAuditEvents(client, context.tenantId, target.documentId, {
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
    });
  }

  async listMatterEvents(
    actorUserId: string,
    matterId: string,
    query: MatterAuditQueryDto,
  ): Promise<AuditEventListDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatterAudit(context.tenantId, actorUserId, matterId);

    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw permissionDenied();

    return this.auditService.transaction(context.tenantId, async (client) => {
      const rows = await this.findMatterAuditEvents(client, context.tenantId, matterId, {
        action: query.action,
        result: query.result,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor,
      });
      const visible = rows.slice(0, query.limit).map(mapTenantAuditRow);
      return {
        items: visible,
        nextCursor: rows.length > query.limit ? encodeCursor(rows[query.limit - 1]!) : null,
      };
    });
  }

  async listTenantEvents(actorUserId: string, query: AuditQueryDto): Promise<AuditEventListDto> {
    const context = this.tenantContext.require();
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw permissionDenied();

    const startedAt = Date.now();
    const rows = await this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertTargetFiltersTenantScoped(client, context.tenantId, query);
      return this.findTenantAuditEvents(client, context.tenantId, { ...query, cursor });
    });
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

    const startedAt = Date.now();
    const rows = await this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertTargetFiltersTenantScoped(client, context.tenantId, query);
      return this.findTenantAuditEvents(client, context.tenantId, { ...query, cursor });
    });
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
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<AuditDocumentTargetRow | null> {
    const result = await client.query(
      `
        SELECT document_id, matter_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    const row = result.rows[0] as { document_id: string; matter_id: string } | undefined;
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

  protected async assertCanReadMatterAudit(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    await this.assertCanReadDocumentAudit(tenantId, actorUserId, matterId);
  }

  protected async findDocumentAuditEvents(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
    query: ResolvedDocumentAuditQuery,
  ): Promise<AuditEventRow[]> {
    const result = await client.query(
      `
        SELECT ae.event_id, ae.action, ae.actor_type, ae.actor_id,
          actor_user.name AS actor_name, actor_user.email AS actor_email,
          ae.result, ae.target_type, ae.target_id, document_target.title AS target_display_name,
          null::text AS target_display_code, ae.session_id, ae.matter_id,
          matter_target.matter_name AS matter_display_name,
          matter_target.matter_code AS matter_display_code,
          ae.metadata_json, ae.created_at
        FROM audit_events ae
        LEFT JOIN users actor_user
          ON actor_user.tenant_id = ae.tenant_id
          AND actor_user.user_id = ae.actor_id
        LEFT JOIN documents document_target
          ON document_target.tenant_id = ae.tenant_id
          AND document_target.document_id = ae.target_id
        LEFT JOIN matters matter_target
          ON matter_target.tenant_id = ae.tenant_id
          AND matter_target.matter_id = ae.matter_id
        WHERE ae.tenant_id = $1
          AND ae.target_type = 'document'
          AND ae.target_id = $2
          AND ae.action = ANY($9::text[])
          AND ($3::text IS NULL OR ae.action = $3)
          AND ($4::timestamptz IS NULL OR ae.created_at >= $4)
          AND ($5::timestamptz IS NULL OR ae.created_at <= $5)
          AND (
            $6::timestamptz IS NULL
            OR (ae.created_at, ae.event_id) < ($6::timestamptz, $7::uuid)
          )
        ORDER BY ae.created_at DESC, ae.event_id DESC
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
        documentTimelineAuditActions,
      ],
    );
    return result.rows as AuditEventRow[];
  }

  protected async findMatterAuditEvents(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    query: ResolvedMatterAuditQuery,
  ): Promise<AuditEventRow[]> {
    return this.findTenantAuditEvents(client, tenantId, {
      actorId: undefined,
      action: query.action,
      result: query.result,
      targetType: undefined,
      targetId: undefined,
      matterId,
      from: query.from,
      to: query.to,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  protected async findTenantAuditEvents(
    client: QueryClient,
    tenantId: TenantId,
    query: ResolvedAuditQuery | ResolvedAuditExportQuery,
  ): Promise<AuditEventRow[]> {
    const result = await client.query(
      `
        SELECT ae.event_id, ae.action, ae.actor_type, ae.actor_id,
          actor_user.name AS actor_name, actor_user.email AS actor_email,
          ae.session_id, ae.result, ae.target_type, ae.target_id,
          CASE
            WHEN ae.target_type = 'document' THEN document_target.title
            WHEN ae.target_type = 'matter' THEN matter_target.matter_name
            WHEN ae.target_type = 'client' THEN client_target.name
            WHEN ae.target_type IN ('auth', 'user') THEN target_user.name
            ELSE null
          END AS target_display_name,
          CASE
            WHEN ae.target_type = 'matter' THEN matter_target.matter_code
            ELSE null
          END AS target_display_code,
          ae.matter_id,
          event_matter.matter_name AS matter_display_name,
          event_matter.matter_code AS matter_display_code,
          ae.metadata_json, ae.created_at
        FROM audit_events ae
        LEFT JOIN users actor_user
          ON actor_user.tenant_id = ae.tenant_id
          AND actor_user.user_id = ae.actor_id
        LEFT JOIN documents document_target
          ON document_target.tenant_id = ae.tenant_id
          AND ae.target_type = 'document'
          AND document_target.document_id = ae.target_id
        LEFT JOIN matters matter_target
          ON matter_target.tenant_id = ae.tenant_id
          AND ae.target_type = 'matter'
          AND matter_target.matter_id = ae.target_id
        LEFT JOIN clients client_target
          ON client_target.tenant_id = ae.tenant_id
          AND ae.target_type = 'client'
          AND client_target.client_id = ae.target_id
        LEFT JOIN users target_user
          ON target_user.tenant_id = ae.tenant_id
          AND ae.target_type IN ('auth', 'user')
          AND target_user.user_id = ae.target_id
        LEFT JOIN matters event_matter
          ON event_matter.tenant_id = ae.tenant_id
          AND event_matter.matter_id = ae.matter_id
        WHERE ae.tenant_id = $1
          AND ($2::uuid IS NULL OR ae.actor_id = $2)
          AND ($3::text IS NULL OR ae.action = $3)
          AND ($4::text IS NULL OR ae.result = $4)
          AND ($5::text IS NULL OR ae.target_type = $5)
          AND ($6::uuid IS NULL OR ae.target_id = $6)
          AND ($7::uuid IS NULL OR ae.matter_id = $7)
          AND ($8::timestamptz IS NULL OR ae.created_at >= $8)
          AND ($9::timestamptz IS NULL OR ae.created_at <= $9)
          AND (
            $10::timestamptz IS NULL
            OR (ae.created_at, ae.event_id) < ($10::timestamptz, $11::uuid)
          )
        ORDER BY ae.created_at DESC, ae.event_id DESC
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
    return result.rows as AuditEventRow[];
  }

  protected async assertTargetFiltersTenantScoped(
    client: QueryClient,
    tenantId: TenantId,
    query: Pick<AuditQueryDto | AuditExportQueryDto, 'matterId' | 'targetType' | 'targetId'>,
  ): Promise<void> {
    if (query.matterId) {
      await this.assertResourceInTenant(client, tenantId, 'matters', 'matter_id', query.matterId);
    }
    if (!query.targetId || !query.targetType) return;

    const target = targetTable(query.targetType);
    if (!target) throw permissionDenied();
    await this.assertResourceInTenant(client, tenantId, target.table, target.column, query.targetId);
  }

  private async assertResourceInTenant(
    client: QueryClient,
    tenantId: TenantId,
    table: string,
    column: string,
    id: string,
  ): Promise<void> {
    const result = await client.query(
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
  const targetDisplayName = row.target_display_name ?? null;
  const targetDisplayCode = row.target_display_code ?? null;
  return {
    eventId: row.event_id,
    action: row.action as DocumentAuditQueryEventType,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorDisplayName: row.actor_name ?? null,
    actorDisplayEmail: row.actor_email ?? null,
    result: row.result,
    targetType: 'document',
    targetId: row.target_id ?? '',
    targetDisplayName,
    targetDisplayCode,
    matterId: row.matter_id,
    matterDisplayName: row.matter_display_name ?? null,
    matterDisplayCode: row.matter_display_code ?? null,
    displayName: targetDisplayName,
    displayCode: targetDisplayCode,
    safeLabel: buildSafeLabel(targetDisplayCode, targetDisplayName),
    canViewSensitiveRef: false,
    metadata: row.metadata_json,
    createdAt: row.created_at.toISOString(),
  };
}

function mapTenantAuditRow(row: AuditEventRow): AuditEventDto {
  const targetDisplayName = row.target_display_name ?? null;
  const targetDisplayCode = row.target_display_code ?? null;
  return {
    eventId: row.event_id,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorDisplayName: row.actor_name ?? null,
    actorDisplayEmail: row.actor_email ?? null,
    sessionId: row.session_id,
    result: row.result,
    targetType: row.target_type,
    targetId: row.target_id,
    targetDisplayName,
    targetDisplayCode,
    matterId: row.matter_id,
    matterDisplayName: row.matter_display_name ?? null,
    matterDisplayCode: row.matter_display_code ?? null,
    displayName: targetDisplayName,
    displayCode: targetDisplayCode,
    safeLabel: buildSafeLabel(targetDisplayCode, targetDisplayName) ?? row.target_type,
    canViewSensitiveRef: false,
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
