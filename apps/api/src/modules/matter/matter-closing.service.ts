import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  MatterClosingChecklistDto,
  MatterClosingChecklistItemCode,
  MatterClosingChecklistItemDto,
  MatterClosingChecklistStatus,
  TenantId,
  WaiveMatterClosingChecklistItemDto,
} from '@amic-vault/shared';
import { matterClosingChecklistItemCodes } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

interface MatterClosingChecklistRow {
  checklist_item_id: string;
  matter_id: string;
  item_code: MatterClosingChecklistItemCode;
  status: MatterClosingChecklistStatus;
  reason_code: string;
  evidence_ref: string | null;
  waived_by: string | null;
  waived_reason: string | null;
  evaluated_at: Date;
  updated_at: Date;
}

interface EvaluationResult {
  evidenceRef: string | null;
  reasonCode: string;
  status: Exclude<MatterClosingChecklistStatus, 'waived'>;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function toChecklistDto(matterId: string, rows: MatterClosingChecklistRow[]): MatterClosingChecklistDto {
  const items = rows.map(toChecklistItemDto);
  return {
    matterId,
    complete: items.every((item) => item.status === 'passed' || item.status === 'waived'),
    items,
  };
}

function toChecklistItemDto(row: MatterClosingChecklistRow): MatterClosingChecklistItemDto {
  return {
    checklistItemId: row.checklist_item_id,
    matterId: row.matter_id,
    itemCode: row.item_code,
    status: row.status,
    reasonCode: row.reason_code,
    evidenceRef: row.evidence_ref,
    waivedBy: row.waived_by,
    waivedReason: row.waived_reason,
    evaluatedAt: row.evaluated_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class MatterClosingService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async getChecklist(actorUserId: string, matterId: string): Promise<MatterClosingChecklistDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      await this.assertMatterExists(tx, context.tenantId, matterId);
      const rows = await this.listRows(tx, context.tenantId, matterId);
      return toChecklistDto(matterId, rows);
    });
  }

  async evaluateChecklist(
    actorUserId: string,
    matterId: string,
  ): Promise<MatterClosingChecklistDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      await this.ensureChecklistRows(tx, context.tenantId, matterId);
      const rows = await this.evaluateRows(tx, context.tenantId, matterId);
      await this.logChecklistEvaluated(tx, context.tenantId, actorUserId, matterId, rows);
      return toChecklistDto(matterId, rows);
    });
  }

  async ensureAndEvaluateForClosing(
    client: QueryClient,
    input: { actorUserId: string; matterId: string; tenantId: TenantId },
  ): Promise<MatterClosingChecklistDto> {
    await this.ensureChecklistRows(client, input.tenantId, input.matterId);
    const rows = await this.evaluateRows(client, input.tenantId, input.matterId);
    await this.logChecklistEvaluated(client, input.tenantId, input.actorUserId, input.matterId, rows);
    return toChecklistDto(input.matterId, rows);
  }

  async isChecklistComplete(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    actorUserId?: string,
  ): Promise<boolean> {
    await this.ensureChecklistRows(client, tenantId, matterId);
    const rows = await this.evaluateRows(client, tenantId, matterId);
    if (actorUserId) await this.logChecklistEvaluated(client, tenantId, actorUserId, matterId, rows);
    return rows.every((row) => row.status === 'passed' || row.status === 'waived');
  }

  async waiveItem(
    actorUserId: string,
    matterId: string,
    itemCode: MatterClosingChecklistItemCode,
    input: WaiveMatterClosingChecklistItemDto,
  ): Promise<MatterClosingChecklistDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      await this.ensureChecklistRows(tx, context.tenantId, matterId);
      const result = await tx.query(
        `
          UPDATE matter_closing_checklists
          SET status = 'waived',
            reason_code = 'waived_by_authorized_user',
            evidence_ref = $5,
            waived_by = $4,
            waived_reason = $6,
            evaluated_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
            AND item_code = $3
          RETURNING checklist_item_id
        `,
        [
          context.tenantId,
          matterId,
          itemCode,
          actorUserId,
          `waiver:${itemCode}`,
          input.reason,
        ],
      );
      if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_CLOSING_CHECKLIST_WAIVED',
          targetType: 'matter_closing_checklist',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            item_code: itemCode,
            reason_code: 'waived_by_authorized_user',
            evidence_ref: `waiver:${itemCode}`,
          },
        },
        tx,
      );
      const rows = await this.listRows(tx, context.tenantId, matterId);
      return toChecklistDto(matterId, rows);
    });
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService
      .canReadMatter({ tenantId, userId: actorUserId }, matterId)
      .catch(() => undefined);
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService
      .canEditMatter({ tenantId, userId: actorUserId }, matterId)
      .catch(() => undefined);
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  private async assertMatterExists(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT 1
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
  }

  private async ensureChecklistRows(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<void> {
    await this.assertMatterExists(client, tenantId, matterId);
    for (const itemCode of matterClosingChecklistItemCodes) {
      await client.query(
        `
          INSERT INTO matter_closing_checklists (
            tenant_id, matter_id, item_code, status, reason_code
          )
          VALUES ($1, $2, $3, 'pending', 'not_evaluated')
          ON CONFLICT (tenant_id, matter_id, item_code) DO NOTHING
        `,
        [tenantId, matterId, itemCode],
      );
    }
  }

  private async evaluateRows(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterClosingChecklistRow[]> {
    const existingRows = await this.listRows(client, tenantId, matterId);
    for (const row of existingRows) {
      if (row.status === 'waived') continue;
      const evaluation = await this.evaluateItem(client, tenantId, matterId, row.item_code);
      await client.query(
        `
          UPDATE matter_closing_checklists
          SET status = $4,
            reason_code = $5,
            evidence_ref = $6,
            waived_by = NULL,
            waived_reason = NULL,
            evaluated_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
            AND item_code = $3
        `,
        [
          tenantId,
          matterId,
          row.item_code,
          evaluation.status,
          evaluation.reasonCode,
          evaluation.evidenceRef,
        ],
      );
    }
    return this.listRows(client, tenantId, matterId);
  }

  private async evaluateItem(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    itemCode: MatterClosingChecklistItemCode,
  ): Promise<EvaluationResult> {
    if (itemCode === 'execution_copy_designated') {
      return (await this.existsExecutionCopy(client, tenantId, matterId))
        ? { evidenceRef: 'document:execution_copy_or_executed', reasonCode: 'execution_copy_found', status: 'passed' }
        : { evidenceRef: null, reasonCode: 'execution_copy_missing', status: 'pending' };
    }
    if (itemCode === 'official_final_version') {
      return (await this.existsOfficialFinalVersion(client, tenantId, matterId))
        ? { evidenceRef: 'document:final_or_execution_copy', reasonCode: 'official_final_found', status: 'passed' }
        : { evidenceRef: null, reasonCode: 'official_final_missing', status: 'pending' };
    }
    if (itemCode === 'legal_hold_clear') {
      return (await this.existsActiveLegalHold(client, tenantId, matterId))
        ? { evidenceRef: 'legal_hold:active', reasonCode: 'active_legal_hold', status: 'pending' }
        : { evidenceRef: 'legal_hold:none_active', reasonCode: 'no_active_legal_hold', status: 'passed' };
    }
    if (itemCode === 'external_links_clear') {
      return (await this.existsActiveExternalLink(client, tenantId, matterId))
        ? { evidenceRef: 'external_link:active', reasonCode: 'active_external_link', status: 'pending' }
        : { evidenceRef: 'external_link:none_active', reasonCode: 'no_active_external_link', status: 'passed' };
    }
    return (await this.existsOpenMatterIssue(client, tenantId, matterId))
      ? { evidenceRef: 'matter_issue:open_or_monitoring', reasonCode: 'open_matter_issue', status: 'pending' }
      : { evidenceRef: 'matter_issue:none_open', reasonCode: 'no_open_matter_issue', status: 'passed' };
  }

  private async existsExecutionCopy(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND (d.status = 'executed' OR dv.version_significance = 'execution_copy')
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async existsOfficialFinalVersion(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND (
            d.status IN ('final', 'executed')
            OR dv.version_significance IN ('final', 'execution_copy')
          )
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async existsActiveLegalHold(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM legal_holds
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async existsActiveExternalLink(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM external_secure_links esl
        JOIN documents d
          ON d.tenant_id = esl.tenant_id
         AND d.document_id = esl.document_id
        WHERE esl.tenant_id = $1
          AND d.matter_id = $2
          AND esl.status = 'active'
          AND esl.expires_at > now()
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async existsOpenMatterIssue(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM matter_issues
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status IN ('open', 'monitoring')
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async listRows(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterClosingChecklistRow[]> {
    const result = await client.query(
      `
        SELECT checklist_item_id, matter_id, item_code, status, reason_code,
          evidence_ref, waived_by, waived_reason, evaluated_at, updated_at
        FROM matter_closing_checklists
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY item_code ASC
      `,
      [tenantId, matterId],
    );
    return result.rows as MatterClosingChecklistRow[];
  }

  private async logChecklistEvaluated(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    rows: readonly MatterClosingChecklistRow[],
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId,
        actorId: actorUserId,
        action: 'MATTER_CLOSING_CHECKLIST_EVALUATED',
        targetType: 'matter',
        targetId: matterId,
        matterId,
        metadata: {
          matter_id: matterId,
          pending_count: rows.filter((row) => row.status === 'pending').length,
          passed_count: rows.filter((row) => row.status === 'passed').length,
          waived_count: rows.filter((row) => row.status === 'waived').length,
          pending_items: rows
            .filter((row) => row.status === 'pending')
            .map((row) => row.item_code),
        },
      },
      client,
    );
  }
}
