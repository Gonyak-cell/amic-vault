import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMatterIssueDto,
  CreateMatterKeyDateDto,
  MatterIssueDto,
  MatterIssueListDto,
  MatterIssueRiskLevel,
  MatterIssueStatus,
  MatterKeyDateDto,
  MatterKeyDateListDto,
  MatterKeyDateSourceType,
  MatterKeyDateStatus,
  MatterKeyDateType,
  PermissionDecision,
  TenantId,
  UpdateMatterIssueDto,
  UpdateMatterKeyDateDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { tenantQuery } from '../../common/db/tenant-query';
import { DatabaseService } from '../../common/db/database.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { isMatterMutationAllowed } from './guards/matter-mutability.guard';

interface MatterStatusRow {
  matter_id: string;
  status: string;
}

interface MatterIssueRow {
  issue_id: string;
  matter_id: string;
  title: string;
  summary: string | null;
  status: MatterIssueStatus;
  risk_level: MatterIssueRiskLevel;
  created_at: Date;
  updated_at: Date;
}

interface MatterKeyDateRow {
  key_date_id: string;
  core_key_date_id: string | null;
  matter_id: string;
  title: string;
  due_date: Date | string;
  date_type: MatterKeyDateType;
  status: MatterKeyDateStatus;
  assigned_to_user_id: string | null;
  source_type: MatterKeyDateSourceType;
  source_id: string;
  mutable: boolean;
  created_at: Date;
  updated_at: Date;
}

type UpdatePlan = {
  setSql: string;
  params: unknown[];
  diffKeys: string[];
};

@Injectable()
export class MatterIssueService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async listIssues(actorUserId: string, matterId: string): Promise<MatterIssueListDto> {
    const context = this.tenantContext.require();
    await this.assertMatterExists(context.tenantId, matterId);
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const result = await tenantQuery<MatterIssueRow>(
      this.databaseService,
      context.tenantId,
      `
        SELECT issue_id, matter_id, title, summary, status, risk_level, created_at, updated_at
        FROM matter_issues
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY
          CASE risk_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          status = 'resolved',
          updated_at DESC,
          issue_id
      `,
      [context.tenantId, matterId],
    );
    return { matterId, items: result.rows.map(mapIssueRow) };
  }

  async createIssue(
    actorUserId: string,
    matterId: string,
    input: CreateMatterIssueDto,
  ): Promise<MatterIssueDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    return this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          INSERT INTO matter_issues (
            tenant_id, matter_id, title, summary, status, risk_level, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          RETURNING issue_id, matter_id, title, summary, status, risk_level, created_at, updated_at
        `,
        [
          context.tenantId,
          matterId,
          input.title,
          input.summary ?? null,
          input.status,
          input.riskLevel,
          actorUserId,
        ],
      );
      const issue = mapIssueRow(result.rows[0] as MatterIssueRow | undefined);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_issue',
          targetId: issue.issueId,
          matterId,
          metadata: {
            matter_id: matterId,
            issue_id: issue.issueId,
            diff_keys: ['matter_issues'],
            status_after: issue.status,
            severity: issue.riskLevel,
          },
        },
        client,
      );
      return issue;
    });
  }

  async updateIssue(
    actorUserId: string,
    matterId: string,
    issueId: string,
    input: UpdateMatterIssueDto,
  ): Promise<MatterIssueDto> {
    const context = this.tenantContext.require();
    const before = await this.findIssue(context.tenantId, matterId, issueId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    const update = buildIssueUpdate(input, actorUserId);
    return this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE matter_issues
          SET ${update.setSql}
          WHERE tenant_id = $1
            AND matter_id = $2
            AND issue_id = $3
          RETURNING issue_id, matter_id, title, summary, status, risk_level, created_at, updated_at
        `,
        [context.tenantId, matterId, issueId, ...update.params],
      );
      const issue = mapIssueRow(result.rows[0] as MatterIssueRow | undefined);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_issue',
          targetId: issue.issueId,
          matterId,
          metadata: {
            matter_id: matterId,
            issue_id: issue.issueId,
            diff_keys: update.diffKeys,
            ...statusAudit(before.status, issue.status),
            severity: issue.riskLevel,
          },
        },
        client,
      );
      return issue;
    });
  }

  async deleteIssue(actorUserId: string, matterId: string, issueId: string): Promise<void> {
    const context = this.tenantContext.require();
    const before = await this.findIssue(context.tenantId, matterId, issueId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          DELETE FROM matter_issues
          WHERE tenant_id = $1
            AND matter_id = $2
            AND issue_id = $3
          RETURNING issue_id
        `,
        [context.tenantId, matterId, issueId],
      );
      if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_issue',
          targetId: issueId,
          matterId,
          metadata: {
            matter_id: matterId,
            issue_id: issueId,
            diff_keys: ['matter_issues'],
            before_ref: `status:${before.status}`,
            after_ref: 'deleted',
          },
        },
        client,
      );
    });
  }

  async listKeyDates(actorUserId: string, matterId: string): Promise<MatterKeyDateListDto> {
    const context = this.tenantContext.require();
    await this.assertMatterExists(context.tenantId, matterId);
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const result = await tenantQuery<MatterKeyDateRow>(
      this.databaseService,
      context.tenantId,
      `
        SELECT
          key_date_id::text AS key_date_id,
          key_date_id::text AS core_key_date_id,
          matter_id,
          title,
          due_date::text AS due_date,
          date_type,
          status,
          assigned_to_user_id::text,
          'core'::text AS source_type,
          key_date_id::text AS source_id,
          true AS mutable,
          created_at,
          updated_at
        FROM matter_key_dates
        WHERE tenant_id = $1
          AND matter_id = $2
        UNION ALL
        SELECT
          'litigation_pleading:' || pleading_id::text AS key_date_id,
          NULL::text AS core_key_date_id,
          matter_id,
          pleading_code || ' · ' || pleading_type AS title,
          internal_deadline::text AS due_date,
          'court'::text AS date_type,
          CASE
            WHEN filing_status IN ('filed_recorded', 'served_recorded') THEN 'completed'
            WHEN filing_status = 'withdrawn' THEN 'cancelled'
            ELSE 'pending'
          END AS status,
          NULL::text AS assigned_to_user_id,
          'litigation_pleading'::text AS source_type,
          pleading_id::text AS source_id,
          false AS mutable,
          created_at,
          updated_at
        FROM litigation_pleadings
        WHERE tenant_id = $1
          AND matter_id = $2
          AND internal_deadline IS NOT NULL
        UNION ALL
        SELECT
          'dd_rfi:' || rfi_id::text AS key_date_id,
          NULL::text AS core_key_date_id,
          matter_id,
          title,
          due_date::text AS due_date,
          'internal'::text AS date_type,
          CASE
            WHEN status IN ('complete', 'reported') THEN 'completed'
            ELSE 'pending'
          END AS status,
          owner_user_id::text AS assigned_to_user_id,
          'dd_rfi'::text AS source_type,
          rfi_id::text AS source_id,
          false AS mutable,
          created_at,
          updated_at
        FROM dd_rfis
        WHERE tenant_id = $1
          AND matter_id = $2
          AND due_date IS NOT NULL
        ORDER BY due_date ASC, source_type, key_date_id
      `,
      [context.tenantId, matterId],
    );
    return { matterId, items: result.rows.map(mapKeyDateRow) };
  }

  async createKeyDate(
    actorUserId: string,
    matterId: string,
    input: CreateMatterKeyDateDto,
  ): Promise<MatterKeyDateDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.assertAssignableUser(context.tenantId, input.assignedToUserId ?? null);
    return this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          INSERT INTO matter_key_dates (
            tenant_id, matter_id, title, due_date, date_type, status,
            assigned_to_user_id, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $8)
          RETURNING
            key_date_id::text AS key_date_id,
            key_date_id::text AS core_key_date_id,
            matter_id,
            title,
            due_date::text AS due_date,
            date_type,
            status,
            assigned_to_user_id::text,
            'core'::text AS source_type,
            key_date_id::text AS source_id,
            true AS mutable,
            created_at,
            updated_at
        `,
        [
          context.tenantId,
          matterId,
          input.title,
          input.dueDate,
          input.dateType,
          input.status,
          input.assignedToUserId ?? null,
          actorUserId,
        ],
      );
      const keyDate = mapKeyDateRow(result.rows[0] as MatterKeyDateRow | undefined);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_key_date',
          targetId: keyDate.coreKeyDateId,
          matterId,
          metadata: {
            matter_id: matterId,
            scope_type: 'matter_key_date',
            scope_id: keyDate.sourceId,
            diff_keys: ['matter_key_dates'],
            status_after: keyDate.status,
          },
        },
        client,
      );
      return keyDate;
    });
  }

  async updateKeyDate(
    actorUserId: string,
    matterId: string,
    keyDateId: string,
    input: UpdateMatterKeyDateDto,
  ): Promise<MatterKeyDateDto> {
    const context = this.tenantContext.require();
    const before = await this.findCoreKeyDate(context.tenantId, matterId, keyDateId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.assertAssignableUser(context.tenantId, input.assignedToUserId ?? null);
    const update = buildKeyDateUpdate(input, actorUserId);
    return this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE matter_key_dates
          SET ${update.setSql}
          WHERE tenant_id = $1
            AND matter_id = $2
            AND key_date_id = $3
          RETURNING
            key_date_id::text AS key_date_id,
            key_date_id::text AS core_key_date_id,
            matter_id,
            title,
            due_date::text AS due_date,
            date_type,
            status,
            assigned_to_user_id::text,
            'core'::text AS source_type,
            key_date_id::text AS source_id,
            true AS mutable,
            created_at,
            updated_at
        `,
        [context.tenantId, matterId, keyDateId, ...update.params],
      );
      const keyDate = mapKeyDateRow(result.rows[0] as MatterKeyDateRow | undefined);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_key_date',
          targetId: keyDate.coreKeyDateId,
          matterId,
          metadata: {
            matter_id: matterId,
            scope_type: 'matter_key_date',
            scope_id: keyDate.sourceId,
            diff_keys: update.diffKeys,
            ...statusAudit(before.status, keyDate.status),
          },
        },
        client,
      );
      return keyDate;
    });
  }

  async deleteKeyDate(actorUserId: string, matterId: string, keyDateId: string): Promise<void> {
    const context = this.tenantContext.require();
    const before = await this.findCoreKeyDate(context.tenantId, matterId, keyDateId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.auditService.transaction(context.tenantId, async (client) => {
      const result = await client.query(
        `
          DELETE FROM matter_key_dates
          WHERE tenant_id = $1
            AND matter_id = $2
            AND key_date_id = $3
          RETURNING key_date_id
        `,
        [context.tenantId, matterId, keyDateId],
      );
      if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter_key_date',
          targetId: keyDateId,
          matterId,
          metadata: {
            matter_id: matterId,
            scope_type: 'matter_key_date',
            scope_id: keyDateId,
            diff_keys: ['matter_key_dates'],
            before_ref: `status:${before.status}`,
            after_ref: 'deleted',
          },
        },
        client,
      );
    });
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canReadMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwReadDenied(decision);
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canEditMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
  }

  private async assertMatterExists(tenantId: TenantId, matterId: string): Promise<MatterStatusRow> {
    const result = await tenantQuery<MatterStatusRow>(
      this.databaseService,
      tenantId,
      'SELECT matter_id, status FROM matters WHERE tenant_id = $1 AND matter_id = $2 LIMIT 1',
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw notFoundDenied();
    return row;
  }

  private async assertMatterMutable(tenantId: TenantId, matterId: string): Promise<void> {
    const matter = await this.assertMatterExists(tenantId, matterId);
    if (!isMatterMutationAllowed(matter.status)) throw matterClosedConflict();
  }

  private async assertAssignableUser(tenantId: TenantId, userId: string | null): Promise<void> {
    if (!userId) return;
    const result = await tenantQuery(
      this.databaseService,
      tenantId,
      'SELECT 1 FROM users WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
      [tenantId, userId],
    );
    if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
  }

  private async findIssue(
    tenantId: TenantId,
    matterId: string,
    issueId: string,
  ): Promise<MatterIssueRow | null> {
    const result = await tenantQuery<MatterIssueRow>(
      this.databaseService,
      tenantId,
      `
        SELECT issue_id, matter_id, title, summary, status, risk_level, created_at, updated_at
        FROM matter_issues
        WHERE tenant_id = $1
          AND matter_id = $2
          AND issue_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, issueId],
    );
    return result.rows[0] ?? null;
  }

  private async findCoreKeyDate(
    tenantId: TenantId,
    matterId: string,
    keyDateId: string,
  ): Promise<MatterKeyDateRow | null> {
    const result = await tenantQuery<MatterKeyDateRow>(
      this.databaseService,
      tenantId,
      `
        SELECT
          key_date_id::text AS key_date_id,
          key_date_id::text AS core_key_date_id,
          matter_id,
          title,
          due_date::text AS due_date,
          date_type,
          status,
          assigned_to_user_id::text,
          'core'::text AS source_type,
          key_date_id::text AS source_id,
          true AS mutable,
          created_at,
          updated_at
        FROM matter_key_dates
        WHERE tenant_id = $1
          AND matter_id = $2
          AND key_date_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, keyDateId],
    );
    return result.rows[0] ?? null;
  }
}

function mapIssueRow(row: MatterIssueRow | undefined): MatterIssueDto {
  if (!row) throw new Error('matter issue query returned no row');
  return {
    issueId: row.issue_id,
    matterId: row.matter_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    riskLevel: row.risk_level,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapKeyDateRow(row: MatterKeyDateRow | undefined): MatterKeyDateDto {
  if (!row) throw new Error('matter key date query returned no row');
  return {
    keyDateId: row.key_date_id,
    coreKeyDateId: row.core_key_date_id,
    matterId: row.matter_id,
    title: row.title,
    dueDate: dateOnly(row.due_date),
    dateType: row.date_type,
    status: row.status,
    assignedToUserId: row.assigned_to_user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    mutable: row.mutable,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function buildIssueUpdate(input: UpdateMatterIssueDto, actorUserId: string): UpdatePlan {
  const params: unknown[] = [];
  const sets: string[] = [];
  const diffKeys: string[] = [];
  const add = (column: string, value: unknown, diffKey: string) => {
    params.push(value);
    sets.push(`${column} = $${params.length + 3}`);
    diffKeys.push(diffKey);
  };
  if (input.title !== undefined) add('title', input.title, 'title');
  if (input.summary !== undefined) add('summary', input.summary ?? null, 'summary');
  if (input.status !== undefined) add('status', input.status, 'status');
  if (input.riskLevel !== undefined) add('risk_level', input.riskLevel, 'risk_level');
  params.push(actorUserId);
  sets.push(`updated_by = $${params.length + 3}`);
  sets.push('updated_at = now()');
  return { setSql: sets.join(', '), params, diffKeys };
}

function buildKeyDateUpdate(input: UpdateMatterKeyDateDto, actorUserId: string): UpdatePlan {
  const params: unknown[] = [];
  const sets: string[] = [];
  const diffKeys: string[] = [];
  const add = (column: string, value: unknown, diffKey: string, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length + 3}${cast}`);
    diffKeys.push(diffKey);
  };
  if (input.title !== undefined) add('title', input.title, 'title');
  if (input.dueDate !== undefined) add('due_date', input.dueDate, 'due_date', '::date');
  if (input.dateType !== undefined) add('date_type', input.dateType, 'date_type');
  if (input.status !== undefined) add('status', input.status, 'status');
  if (input.assignedToUserId !== undefined) {
    add('assigned_to_user_id', input.assignedToUserId ?? null, 'assigned_to_user_id');
  }
  params.push(actorUserId);
  sets.push(`updated_by = $${params.length + 3}`);
  sets.push('updated_at = now()');
  return { setSql: sets.join(', '), params, diffKeys };
}

function statusAudit(before: string, after: string) {
  return before === after ? {} : { status_before: before, status_after: after };
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function matterClosedConflict(): ConflictException {
  return new ConflictException({ code: 'VALIDATION_FAILED', reason: 'MATTER_CLOSED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  if (decision.reasonCode === 'VALIDATION_FAILED') throw validationFailed();
  throw permissionDenied();
}
