import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MatterState,
  isMatterState,
  validateMatterTransition,
  type MatterStateValue,
} from '@amic-vault/domain';
import { Pool } from 'pg';
import type {
  CreateMatterDto,
  ListMattersQueryDto,
  MatterAccessScope,
  MatterConfidentialityLevel,
  MatterConflictStatus,
  MatterIntakeTemplateCode,
  MatterListDto,
  MatterRelatedMatterDto,
  MatterRelatedMatterListDto,
  MatterRelationType,
  MatterStatus,
  MatterType,
  PermissionDecision,
  TenantId,
  UpdateLegalHoldDto,
  UpdateMatterDto,
  UserRole,
} from '@amic-vault/shared';
import { buildSafeLabel, isUserRole, matterIntakeTemplateAccessScopes } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { tenantQuery } from '../../common/db/tenant-query';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { assertMatterMutationAllowed } from './guards/matter-mutability.guard';
import type { UpdateMatterStatusDto } from './dto/update-matter-status.dto';
import { ClosingBinderService } from './closing-binder.service';
import { KnowledgeCandidateService } from './knowledge-candidate.service';
import { MatterClosingService } from './matter-closing.service';
import { MatterMemberService } from './matter-member.service';
import { MatterEntity } from './matter.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
export const DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME = 'AMIC local file organization prep';
const DEFAULT_MATTER_INTAKE_TEMPLATE_CODE =
  'default_open' satisfies MatterIntakeTemplateCode;

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface MatterRow {
  access_scope: MatterAccessScope;
  matter_id: string;
  tenant_id: string;
  client_id: string;
  client_display_name: string | null;
  confidentiality_level: MatterConfidentialityLevel;
  matter_code: string;
  matter_name: string;
  matter_type: MatterType;
  status: MatterStatus;
  conflicts_status: MatterConflictStatus;
  opened_at: Date | null;
  closed_at: Date | null;
  lead_lawyer_id: string | null;
  lead_lawyer_display_name: string | null;
  lead_lawyer_display_email: string | null;
  lead_partner_id: string | null;
  lead_partner_display_name: string | null;
  lead_partner_display_email: string | null;
  lead_associate_id: string | null;
  lead_associate_display_name: string | null;
  lead_associate_display_email: string | null;
  practice_group: string | null;
  metadata_json: Record<string, string>;
  legal_hold: boolean;
  ethical_wall_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface MatterListRow extends MatterRow {
  total_count: string;
}

interface RelatedMatterRow {
  link_id: string;
  matter_id: string;
  related_matter_id: string;
  relation_type: MatterRelationType;
  direction: 'direct' | 'inverse';
  related_matter_code: string;
  related_matter_name: string;
  related_matter_type: MatterType;
  related_matter_status: MatterStatus;
  created_at: Date;
}

interface DefaultAiPolicyRow {
  policy_id: string;
}

interface MatterIntakeTemplateRow {
  template_id: string;
  template_code: MatterIntakeTemplateCode;
  default_access_scope: MatterAccessScope;
  default_ai_policy_id: string | null;
}

interface ResolvedMatterIntakeTemplate {
  accessScope: MatterAccessScope;
  aiPolicyId: string;
  templateCode: MatterIntakeTemplateCode;
  templateId: string;
}

export function canCreateMatterRole(role: string): boolean {
  return role === 'firm_admin' || role === 'matter_owner';
}

export function canChangeLegalHoldRole(role: string): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function mapMatter(row: MatterRow): MatterEntity {
  return new MatterEntity({
    accessScope: row.access_scope,
    matterId: row.matter_id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientDisplayName: row.client_display_name,
    confidentialityLevel: row.confidentiality_level,
    matterCode: row.matter_code,
    matterName: row.matter_name,
    matterType: row.matter_type,
    status: row.status,
    conflictsStatus: row.conflicts_status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    leadLawyerId: row.lead_lawyer_id,
    leadLawyerDisplayName: row.lead_lawyer_display_name,
    leadLawyerDisplayEmail: row.lead_lawyer_display_email,
    leadPartnerId: row.lead_partner_id,
    leadPartnerDisplayName: row.lead_partner_display_name,
    leadPartnerDisplayEmail: row.lead_partner_display_email,
    leadAssociateId: row.lead_associate_id,
    leadAssociateDisplayName: row.lead_associate_display_name,
    leadAssociateDisplayEmail: row.lead_associate_display_email,
    practiceGroup: row.practice_group,
    metadata: row.metadata_json,
    legalHold: row.legal_hold,
    ethicalWallActive: row.ethical_wall_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function inverseRelationType(relationType: MatterRelationType): MatterRelationType {
  if (relationType === 'preceding') return 'subsequent';
  if (relationType === 'subsequent') return 'preceding';
  return 'parallel';
}

function mapRelatedMatter(row: RelatedMatterRow, canReadRelatedMatter: boolean): MatterRelatedMatterDto {
  const relationType =
    row.direction === 'inverse' ? inverseRelationType(row.relation_type) : row.relation_type;
  return {
    linkId: row.link_id,
    matterId: row.matter_id,
    relatedMatterId: row.related_matter_id,
    relationType,
    canReadRelatedMatter,
    relatedMatterCode: canReadRelatedMatter ? row.related_matter_code : null,
    relatedMatterName: canReadRelatedMatter ? row.related_matter_name : null,
    relatedMatterStatus: canReadRelatedMatter ? row.related_matter_status : null,
    relatedMatterType: canReadRelatedMatter ? row.related_matter_type : null,
    displayCode: canReadRelatedMatter ? row.related_matter_code : null,
    displayName: canReadRelatedMatter ? row.related_matter_name : null,
    safeLabel: canReadRelatedMatter
      ? buildSafeLabel(row.related_matter_code, row.related_matter_name)
      : '권한 제한 Matter',
    canViewSensitiveRef: canReadRelatedMatter,
    createdAt: row.created_at.toISOString(),
  };
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function transitionBlocked(reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'VALIDATION_FAILED',
    reason,
  });
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

function canonicalMetadata(value: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, string>>((output, key) => {
        output[key] = value[key]!;
        return output;
      }, {}),
  );
}

function resolveMatterIntakeTemplateCode(input: CreateMatterDto): MatterIntakeTemplateCode {
  if (input.intakeTemplateCode) return input.intakeTemplateCode;
  if (input.accessScope === 'restricted') return 'restricted';
  return DEFAULT_MATTER_INTAKE_TEMPLATE_CODE;
}

function matterDiffKeys(before: MatterEntity, input: UpdateMatterDto): string[] {
  const keys: string[] = [];
  if (input.accessScope !== undefined && input.accessScope !== before.props.accessScope) {
    keys.push('access_scope');
  }
  if (
    input.confidentialityLevel !== undefined &&
    input.confidentialityLevel !== before.props.confidentialityLevel
  ) {
    keys.push('confidentiality_level');
  }
  if (input.leadPartnerId !== undefined && input.leadPartnerId !== before.props.leadPartnerId) {
    keys.push('lead_partner_id');
  }
  if (
    input.leadAssociateId !== undefined &&
    input.leadAssociateId !== before.props.leadAssociateId
  ) {
    keys.push('lead_associate_id');
  }
  if (input.matterName !== undefined && input.matterName !== before.props.matterName) {
    keys.push('matter_name');
  }
  if (input.practiceGroup !== undefined && input.practiceGroup !== before.props.practiceGroup) {
    keys.push('practice_group');
  }
  if (
    input.metadata !== undefined &&
    canonicalMetadata(input.metadata) !== canonicalMetadata(before.props.metadata)
  ) {
    keys.push('metadata');
  }
  return keys;
}

@Injectable()
export class MatterService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(MatterMemberService) private readonly matterMemberService: MatterMemberService,
    @Inject(PermissionQueryBuilder) private readonly permissionQueryBuilder: PermissionQueryBuilder,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(MatterClosingService) private readonly matterClosingService: MatterClosingService,
    @Inject(ClosingBinderService) private readonly closingBinderService: ClosingBinderService,
    @Inject(KnowledgeCandidateService)
    private readonly knowledgeCandidateService: KnowledgeCandidateService,
  ) {}

  async create(actorUserId: string, input: CreateMatterDto) {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || !canCreateMatterRole(actor.role)) throw permissionDenied();

    await this.assertClientUsable(context.tenantId, input.clientId);
    const leadPartnerId = input.leadPartnerId ?? input.leadLawyerId ?? actorUserId;
    await this.assertLeadLawyerUsable(context.tenantId, leadPartnerId);
    if (input.leadAssociateId) {
      await this.assertLeadLawyerUsable(context.tenantId, input.leadAssociateId);
    }

    const templateCode = resolveMatterIntakeTemplateCode(input);
    const matter = await this.auditService.transaction(context.tenantId, async (tx) => {
      const template = await this.resolveMatterIntakeTemplate(
        tx,
        context.tenantId,
        templateCode,
        input,
      );
      const created = await this.insertMatter(
        tx,
        context.tenantId,
        actorUserId,
        leadPartnerId,
        input,
        template.accessScope,
        template.aiPolicyId,
      );
      await this.matterMemberService.addLeadOwner(
        tx,
        context.tenantId,
        created.props.matterId,
        leadPartnerId,
        actorUserId,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_CREATED',
          targetType: 'matter',
          targetId: created.props.matterId,
          matterId: created.props.matterId,
          metadata: {
            matter_id: created.props.matterId,
            client_id: created.props.clientId,
            template_ref: `matter_intake_template:${template.templateCode}`,
            template_id: template.templateId,
            policy_id: template.aiPolicyId,
          },
        },
        tx,
      );
      return created;
    });

    return matter.toDto();
  }

  async get(actorUserId: string, matterId: string) {
    const context = this.tenantContext.require();
    const matter = await this.findByIdForTenant(context.tenantId, matterId);
    if (!matter) throw notFoundDenied();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matter.props.matterId);
    return matter.toDto();
  }

  async update(actorUserId: string, matterId: string, input: UpdateMatterDto) {
    const context = this.tenantContext.require();
    const before = await this.findByIdForTenant(context.tenantId, matterId);
    if (!before) throw notFoundDenied();
    const requiresOwner =
      input.accessScope !== undefined ||
      input.confidentialityLevel !== undefined ||
      input.leadPartnerId !== undefined ||
      input.leadAssociateId !== undefined;
    const requiresEdit =
      input.matterName !== undefined ||
      input.practiceGroup !== undefined ||
      input.metadata !== undefined;
    if (requiresOwner) {
      await this.assertCanManageMatterMembers(context.tenantId, actorUserId, matterId);
    }
    if (requiresEdit) await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    assertMatterMutationAllowed(before.props.status);
    if (input.leadPartnerId) {
      await this.assertLeadLawyerUsable(context.tenantId, input.leadPartnerId);
    }
    if (input.leadAssociateId) {
      await this.assertLeadLawyerUsable(context.tenantId, input.leadAssociateId);
    }

    const diffKeys = matterDiffKeys(before, input);
    if (diffKeys.length === 0) return before.toDto();

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const changed = await this.updateMatterMetadata(tx, context.tenantId, matterId, input);
      if (!changed) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            diff_keys: diffKeys,
          },
        },
        tx,
      );
      return changed;
    });

    return updated.toDto();
  }

  async updateStatus(actorUserId: string, matterId: string, input: UpdateMatterStatusDto) {
    const context = this.tenantContext.require();
    const before = await this.findByIdForTenant(context.tenantId, matterId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);

    const from = asMatterState(before.props.status);
    const to = asMatterState(input.status);
    let closingChecklistComplete: boolean | undefined;
    if (from === MatterState.Closing && to === MatterState.Closed) {
      closingChecklistComplete = await this.auditService.transaction(context.tenantId, (tx) =>
        this.matterClosingService.isChecklistComplete(
          tx,
          context.tenantId,
          matterId,
          actorUserId,
        ),
      );
    }
    const transition = validateMatterTransition(from, to, {
      ...(closingChecklistComplete === undefined ? {} : { closingChecklistComplete }),
      conflictsStatus: before.props.conflictsStatus,
    });
    if (!transition.allowed) {
      if (
        transition.reasonCode === 'CONFLICTS_NOT_CLEARED' ||
        transition.reasonCode === 'CLOSING_CHECKLIST_INCOMPLETE'
      ) {
        await this.recordStatusTransitionDenied(
          context.tenantId,
          actorUserId,
          matterId,
          from,
          to,
          transition.reasonCode === 'CONFLICTS_NOT_CLEARED'
            ? `conflicts_status:${before.props.conflictsStatus}`
            : 'closing_checklist:incomplete',
          transition.reasonCode,
        );
        throw transitionBlocked(transition.reasonCode);
      }
      throw validationFailed(transition.reasonCode);
    }
    if (from === MatterState.Closing && to === MatterState.Closed && before.props.closedAt) {
      throw validationFailed('MATTER_CLOSED');
    }

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const changed = await this.updateMatterStatus(tx, context.tenantId, matterId, to);
      if (!changed) throw notFoundDenied();
      if (from === MatterState.Active && to === MatterState.Closing) {
        await this.matterClosingService.ensureAndEvaluateForClosing(tx, {
          actorUserId,
          matterId,
          tenantId: context.tenantId,
        });
      }
      if (from === MatterState.Closing && to === MatterState.Closed) {
        const binder = await this.closingBinderService.finalizeForClosedMatter(tx, {
          actorUserId,
          matterId,
          tenantId: context.tenantId,
        });
        await this.knowledgeCandidateService.createForClosedMatter(tx, {
          actorUserId,
          closingBinderId: binder.closingBinderId,
          matterId,
          tenantId: context.tenantId,
        });
      }
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_STATUS_CHANGED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            before_ref: `status:${from}`,
            after_ref: `status:${to}`,
            reason_code: 'matter_status_changed',
          },
        },
        tx,
      );
      return changed;
    });

    return updated.toDto();
  }

  async updateLegalHold(actorUserId: string, matterId: string, input: UpdateLegalHoldDto) {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || !canChangeLegalHoldRole(actor.role)) throw permissionDenied();

    return this.auditService.transaction(context.tenantId, async (tx) => {
      const before = await this.findByIdForTenant(context.tenantId, matterId, tx);
      if (!before) throw notFoundDenied();
      if (before.props.legalHold === input.legalHold) return before.toDto();

      const updated = await this.updateMatterLegalHold(
        tx,
        context.tenantId,
        matterId,
        input.legalHold,
      );
      if (!updated) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'LEGAL_HOLD_CHANGED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            before_ref: `legal_hold:${before.props.legalHold}`,
            after_ref: `legal_hold:${updated.props.legalHold}`,
          },
        },
        tx,
      );
      return updated.toDto();
    });
  }

  async list(actorUserId: string, query: ListMattersQueryDto): Promise<MatterListDto> {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || !isUserRole(actor.role)) throw permissionDenied();
    const { items, totalCount } = await this.listForTenant(
      context.tenantId,
      actorUserId,
      actor.role,
      query,
    );
    return {
      items: items.map((matter) => matter.toDto()),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listRelatedMatters(
    actorUserId: string,
    matterId: string,
  ): Promise<MatterRelatedMatterListDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const rows = await this.findRelatedMatterRows(context.tenantId, matterId);
    const items: MatterRelatedMatterDto[] = [];
    for (const row of rows) {
      items.push(
        mapRelatedMatter(
          row,
          await this.canReadMatter(context.tenantId, actorUserId, row.related_matter_id),
        ),
      );
    }
    return { items };
  }

  async addRelatedMatter(
    actorUserId: string,
    matterId: string,
    input: { relatedMatterId: string; relationType: MatterRelationType },
  ): Promise<MatterRelatedMatterListDto> {
    const context = this.tenantContext.require();
    if (matterId === input.relatedMatterId) throw validationFailed('RELATED_MATTER_SELF_LINK');
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertCanReadMatter(context.tenantId, actorUserId, input.relatedMatterId);

    await this.auditService.transaction(context.tenantId, async (tx) => {
      await tx.query(
        `
          INSERT INTO related_matters (
            tenant_id, matter_id, related_matter_id, relation_type, created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, matter_id, related_matter_id, relation_type) DO NOTHING
        `,
        [context.tenantId, matterId, input.relatedMatterId, input.relationType, actorUserId],
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            diff_keys: ['related_matters'],
            related_matter_id: input.relatedMatterId,
            relation_type: input.relationType,
          },
        },
        tx,
      );
    });
    return this.listRelatedMatters(actorUserId, matterId);
  }

  async removeRelatedMatter(
    actorUserId: string,
    matterId: string,
    relatedMatterId: string,
    relationType: MatterRelationType,
  ): Promise<MatterRelatedMatterListDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    const inverseRelation = inverseRelationType(relationType);
    await this.auditService.transaction(context.tenantId, async (tx) => {
      await tx.query(
        `
          DELETE FROM related_matters
          WHERE tenant_id = $1
            AND (
              (
                matter_id = $2
                AND related_matter_id = $3
                AND relation_type = $4
              )
              OR (
                matter_id = $3
                AND related_matter_id = $2
                AND relation_type = $5
              )
            )
        `,
        [context.tenantId, matterId, relatedMatterId, relationType, inverseRelation],
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_UPDATED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            diff_keys: ['related_matters'],
            related_matter_id: relatedMatterId,
            relation_type: relationType,
            removed: true,
          },
        },
        tx,
      );
    });
    return this.listRelatedMatters(actorUserId, matterId);
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

  private async canReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<boolean> {
    try {
      const decision = await this.permissionService.canReadMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      return false;
    }
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

  private async assertCanManageMatterMembers(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canManageMatterMembers(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
  }

  private async assertClientUsable(tenantId: TenantId, clientId: string): Promise<void> {
    if (await this.clientExistsForTenant(tenantId, clientId)) return;
    if (await this.clientExistsAnyTenant(clientId)) throw notFoundDenied();
    throw validationFailed();
  }

  private async assertLeadLawyerUsable(tenantId: TenantId, userId: string): Promise<void> {
    const user = await this.userService.findByTenantAndId(tenantId, userId);
    if (user) return;
    if (await this.userExistsAnyTenant(userId)) throw notFoundDenied();
    throw validationFailed();
  }

  private async clientExistsForTenant(tenantId: TenantId, clientId: string): Promise<boolean> {
    const result = await tenantQuery(
      getPool(),
      tenantId,
      'SELECT 1 FROM clients WHERE tenant_id = $1 AND client_id = $2 LIMIT 1',
      [tenantId, clientId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async clientExistsAnyTenant(clientId: string): Promise<boolean> {
    const result = await getPool().query('SELECT 1 FROM clients WHERE client_id = $1 LIMIT 1', [
      clientId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  private async userExistsAnyTenant(userId: string): Promise<boolean> {
    const result = await getPool().query('SELECT 1 FROM users WHERE user_id = $1 LIMIT 1', [
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  private async findRelatedMatterRows(
    tenantId: TenantId,
    matterId: string,
  ): Promise<RelatedMatterRow[]> {
    const result = await tenantQuery<RelatedMatterRow>(
      getPool(),
      tenantId,
      `
        SELECT rm.link_id, rm.matter_id, rm.related_matter_id, rm.relation_type,
          'direct'::text AS direction,
          related.matter_code AS related_matter_code,
          related.matter_name AS related_matter_name,
          related.matter_type AS related_matter_type,
          related.status AS related_matter_status,
          rm.created_at
        FROM related_matters rm
        JOIN matters related
          ON related.tenant_id = rm.tenant_id
         AND related.matter_id = rm.related_matter_id
        WHERE rm.tenant_id = $1
          AND rm.matter_id = $2
        UNION ALL
        SELECT rm.link_id, rm.related_matter_id AS matter_id, rm.matter_id AS related_matter_id,
          rm.relation_type,
          'inverse'::text AS direction,
          related.matter_code AS related_matter_code,
          related.matter_name AS related_matter_name,
          related.matter_type AS related_matter_type,
          related.status AS related_matter_status,
          rm.created_at
        FROM related_matters rm
        JOIN matters related
          ON related.tenant_id = rm.tenant_id
         AND related.matter_id = rm.matter_id
        WHERE rm.tenant_id = $1
          AND rm.related_matter_id = $2
        ORDER BY created_at DESC, related_matter_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async insertMatter(
    client: QueryClient,
    tenantId: TenantId,
    createdBy: string,
    leadLawyerId: string,
    input: CreateMatterDto,
    accessScope: MatterAccessScope,
    aiPolicyId: string,
  ): Promise<MatterEntity> {
    const result = await client.query(
      `
        WITH inserted AS (
          INSERT INTO matters (
          tenant_id, client_id, matter_code, matter_name, matter_type, status,
          opened_at, closed_at, lead_lawyer_id, lead_partner_id, lead_associate_id,
          confidentiality_level, practice_group, metadata_json, created_by, ai_policy_id, access_scope
          )
          VALUES (
            $1, $2, $3, $4, $5, 'proposed', $6, $7, $8, $8, $9, $10,
            $11, $12::jsonb, $13, $14, $15
          )
          RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, conflicts_status, opened_at, closed_at, lead_lawyer_id, lead_partner_id,
            lead_associate_id, confidentiality_level, practice_group, metadata_json,
            legal_hold, access_scope, created_by, created_at, updated_at
        )
        SELECT inserted.*, clients.name AS client_display_name,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          false AS ethical_wall_active
        FROM inserted
        JOIN clients
          ON clients.tenant_id = inserted.tenant_id
         AND clients.client_id = inserted.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = inserted.tenant_id
         AND lead_lawyer.user_id = inserted.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = inserted.tenant_id
         AND lead_partner.user_id = inserted.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = inserted.tenant_id
         AND lead_associate.user_id = inserted.lead_associate_id
      `,
      [
        tenantId,
        input.clientId,
        input.matterCode,
        input.matterName,
        input.matterType,
        input.openedAt ?? null,
        input.closedAt ?? null,
        leadLawyerId,
        input.leadAssociateId ?? null,
        input.confidentialityLevel ?? 'standard',
        input.practiceGroup ?? null,
        JSON.stringify(input.metadata ?? {}),
        createdBy,
        aiPolicyId,
        accessScope,
      ],
    );
    const row = result.rows[0] as MatterRow | undefined;
    if (!row) throw new Error('matter insert returned no row');
    return mapMatter(row);
  }

  private async findDefaultLocalAiPolicyId(
    client: QueryClient,
    tenantId: TenantId,
  ): Promise<string | null> {
    const result = await client.query(
      `
        SELECT policy_id
        FROM ai_policies
        WHERE tenant_id = $1
          AND name = $2
          AND allowed_model_tiers = ARRAY['local']::text[]
          AND external_model_allowed = false
          AND default_effect = 'DENY'
        ORDER BY updated_at DESC, created_at DESC, policy_id
        LIMIT 1
      `,
      [tenantId, DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME],
    );
    const row = result.rows[0] as DefaultAiPolicyRow | undefined;
    return row?.policy_id ?? null;
  }

  private async resolveMatterIntakeTemplate(
    client: QueryClient,
    tenantId: TenantId,
    templateCode: MatterIntakeTemplateCode,
    input: CreateMatterDto,
  ): Promise<ResolvedMatterIntakeTemplate> {
    const result = await client.query(
      `
        SELECT template_id, template_code, default_access_scope, default_ai_policy_id
        FROM matter_intake_templates
        WHERE tenant_id = $1
          AND template_code = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, templateCode],
    );
    const row = result.rows[0] as MatterIntakeTemplateRow | undefined;
    if (!row) throw validationFailed('MATTER_TEMPLATE_NOT_FOUND');

    const accessScope = matterIntakeTemplateAccessScopes[row.template_code];
    if (row.default_access_scope !== accessScope) {
      throw validationFailed('MATTER_TEMPLATE_ACCESS_SCOPE_MISMATCH');
    }
    if (input.accessScope !== undefined && input.accessScope !== accessScope) {
      throw validationFailed('MATTER_TEMPLATE_ACCESS_SCOPE_MISMATCH');
    }

    const aiPolicyId =
      row.default_ai_policy_id ?? (await this.findDefaultLocalAiPolicyId(client, tenantId));
    if (!aiPolicyId) throw validationFailed('MATTER_AI_POLICY_REQUIRED');

    return {
      accessScope,
      aiPolicyId,
      templateCode: row.template_code,
      templateId: row.template_id,
    };
  }

  private async findByIdForTenant(
    tenantId: TenantId,
    matterId: string,
    queryClient?: QueryClient,
  ): Promise<MatterEntity | null> {
    const sql = `
        SELECT matters.matter_id, matters.tenant_id, matters.client_id,
          clients.name AS client_display_name, matters.confidentiality_level,
          matters.matter_code, matters.matter_name,
          matters.matter_type, matters.status, matters.opened_at, matters.closed_at,
          matters.conflicts_status, matters.lead_lawyer_id,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          matters.lead_partner_id,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          matters.lead_associate_id,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          matters.practice_group, matters.metadata_json, matters.legal_hold,
          matters.access_scope, matters.created_by, matters.created_at, matters.updated_at,
          EXISTS (
            SELECT 1
            FROM ethical_walls ew
            WHERE ew.tenant_id = matters.tenant_id
              AND ew.matter_id = matters.matter_id
              AND ew.status = 'active'
          ) AS ethical_wall_active
        FROM matters
        JOIN clients
          ON clients.tenant_id = matters.tenant_id
         AND clients.client_id = matters.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = matters.tenant_id
         AND lead_lawyer.user_id = matters.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = matters.tenant_id
         AND lead_partner.user_id = matters.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = matters.tenant_id
         AND lead_associate.user_id = matters.lead_associate_id
        WHERE matters.tenant_id = $1
          AND matters.matter_id = $2
      `;
    const params = [tenantId, matterId];
    const result = queryClient
      ? await queryClient.query(sql, params)
      : await tenantQuery<MatterRow>(getPool(), tenantId, sql, params);
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async updateMatterStatus(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    status: MatterStateValue,
  ): Promise<MatterEntity | null> {
    const result = await client.query(
      `
        WITH updated AS (
          UPDATE matters
          SET status = $3,
              opened_at = CASE
                WHEN $3 = 'open' AND opened_at IS NULL THEN now()
                ELSE opened_at
              END,
              closed_at = CASE
                WHEN $3 = 'closed' THEN COALESCE(closed_at, now())
                ELSE closed_at
              END,
              updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
          RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, conflicts_status, opened_at, closed_at, lead_lawyer_id, lead_partner_id,
            lead_associate_id, confidentiality_level, practice_group, metadata_json,
            legal_hold, access_scope, created_by, created_at, updated_at
        )
        SELECT updated.*, clients.name AS client_display_name,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          EXISTS (
            SELECT 1
            FROM ethical_walls ew
            WHERE ew.tenant_id = updated.tenant_id
              AND ew.matter_id = updated.matter_id
              AND ew.status = 'active'
          ) AS ethical_wall_active
        FROM updated
        JOIN clients
          ON clients.tenant_id = updated.tenant_id
         AND clients.client_id = updated.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = updated.tenant_id
         AND lead_lawyer.user_id = updated.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = updated.tenant_id
         AND lead_partner.user_id = updated.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = updated.tenant_id
         AND lead_associate.user_id = updated.lead_associate_id
      `,
      [tenantId, matterId, status],
    );
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async recordStatusTransitionDenied(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    from: MatterStateValue,
    to: MatterStateValue,
    blockedReason: string,
    reasonCode: string,
  ): Promise<void> {
    await this.auditService.log({
      tenantId,
      actorId: actorUserId,
      action: 'ACCESS_DENIED',
      targetType: 'matter',
      targetId: matterId,
      matterId,
      result: 'denied',
      metadata: {
        matter_id: matterId,
        before_ref: `status:${from}`,
        after_ref: `status:${to}`,
        blocked_reason: blockedReason,
        reason_code: reasonCode,
      },
    });
  }

  private async updateMatterMetadata(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    input: UpdateMatterDto,
  ): Promise<MatterEntity | null> {
    const params: unknown[] = [tenantId, matterId];
    const sets: string[] = [];
    if (input.matterName !== undefined) {
      params.push(input.matterName);
      sets.push(`matter_name = $${params.length}`);
    }
    if (input.practiceGroup !== undefined) {
      params.push(input.practiceGroup);
      sets.push(`practice_group = $${params.length}`);
    }
    if (input.metadata !== undefined) {
      params.push(JSON.stringify(input.metadata));
      sets.push(`metadata_json = $${params.length}::jsonb`);
    }
    if (input.accessScope !== undefined) {
      params.push(input.accessScope);
      sets.push(`access_scope = $${params.length}`);
    }
    if (input.confidentialityLevel !== undefined) {
      params.push(input.confidentialityLevel);
      sets.push(`confidentiality_level = $${params.length}`);
    }
    if (input.leadPartnerId !== undefined) {
      params.push(input.leadPartnerId);
      sets.push(`lead_partner_id = $${params.length}`, `lead_lawyer_id = $${params.length}`);
    }
    if (input.leadAssociateId !== undefined) {
      params.push(input.leadAssociateId);
      sets.push(`lead_associate_id = $${params.length}`);
    }
    sets.push('updated_at = now()');

    const result = await client.query(
      `
        WITH updated AS (
          UPDATE matters
          SET ${sets.join(', ')}
          WHERE tenant_id = $1
            AND matter_id = $2
          RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, conflicts_status, opened_at, closed_at, lead_lawyer_id, lead_partner_id,
            lead_associate_id, confidentiality_level, practice_group, metadata_json,
            legal_hold, access_scope, created_by, created_at, updated_at
        )
        SELECT updated.*, clients.name AS client_display_name,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          EXISTS (
            SELECT 1
            FROM ethical_walls ew
            WHERE ew.tenant_id = updated.tenant_id
              AND ew.matter_id = updated.matter_id
              AND ew.status = 'active'
          ) AS ethical_wall_active
        FROM updated
        JOIN clients
          ON clients.tenant_id = updated.tenant_id
         AND clients.client_id = updated.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = updated.tenant_id
         AND lead_lawyer.user_id = updated.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = updated.tenant_id
         AND lead_partner.user_id = updated.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = updated.tenant_id
         AND lead_associate.user_id = updated.lead_associate_id
      `,
      params,
    );
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async updateMatterLegalHold(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    legalHold: boolean,
  ): Promise<MatterEntity | null> {
    const result = await client.query(
      `
        WITH updated AS (
          UPDATE matters
          SET legal_hold = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
          RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, conflicts_status, opened_at, closed_at, lead_lawyer_id, lead_partner_id,
            lead_associate_id, confidentiality_level, practice_group, metadata_json,
            legal_hold, access_scope, created_by, created_at, updated_at
        )
        SELECT updated.*, clients.name AS client_display_name,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          EXISTS (
            SELECT 1
            FROM ethical_walls ew
            WHERE ew.tenant_id = updated.tenant_id
              AND ew.matter_id = updated.matter_id
              AND ew.status = 'active'
          ) AS ethical_wall_active
        FROM updated
        JOIN clients
          ON clients.tenant_id = updated.tenant_id
         AND clients.client_id = updated.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = updated.tenant_id
         AND lead_lawyer.user_id = updated.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = updated.tenant_id
         AND lead_partner.user_id = updated.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = updated.tenant_id
         AND lead_associate.user_id = updated.lead_associate_id
      `,
      [tenantId, matterId, legalHold],
    );
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async listForTenant(
    tenantId: TenantId,
    actorUserId: string,
    actorRole: UserRole,
    query: ListMattersQueryDto,
  ): Promise<{ items: MatterEntity[]; totalCount: number }> {
    const filters = ['matters.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    const permissionFilter = this.permissionQueryBuilder.buildMatterFilter(
      { tenantId, userId: actorUserId, role: actorRole },
      params.length + 1,
      'matters',
    );
    filters.push(permissionFilter.sql);
    params.push(...permissionFilter.params);
    if (query.status) {
      params.push(query.status);
      filters.push(`matters.status = $${params.length}`);
    }
    if (query.matterType) {
      params.push(query.matterType);
      filters.push(`matters.matter_type = $${params.length}`);
    }
    if (query.clientId) {
      params.push(query.clientId);
      filters.push(`matters.client_id = $${params.length}`);
    }

    params.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await tenantQuery<MatterListRow>(
      getPool(),
      tenantId,
      `
        SELECT matters.matter_id, matters.tenant_id, matters.client_id,
          clients.name AS client_display_name, matters.confidentiality_level,
          matters.matter_code, matters.matter_name,
          matters.matter_type, matters.status, matters.opened_at, matters.closed_at,
          matters.conflicts_status, matters.lead_lawyer_id,
          lead_lawyer.name AS lead_lawyer_display_name,
          lead_lawyer.email AS lead_lawyer_display_email,
          matters.lead_partner_id,
          lead_partner.name AS lead_partner_display_name,
          lead_partner.email AS lead_partner_display_email,
          matters.lead_associate_id,
          lead_associate.name AS lead_associate_display_name,
          lead_associate.email AS lead_associate_display_email,
          matters.practice_group, matters.metadata_json, matters.legal_hold,
          matters.access_scope, matters.created_by, matters.created_at, matters.updated_at,
          EXISTS (
            SELECT 1
            FROM ethical_walls ew
            WHERE ew.tenant_id = matters.tenant_id
              AND ew.matter_id = matters.matter_id
              AND ew.status = 'active'
          ) AS ethical_wall_active,
          count(*) OVER()::text AS total_count
        FROM matters
        JOIN clients
          ON clients.tenant_id = matters.tenant_id
         AND clients.client_id = matters.client_id
        LEFT JOIN users lead_lawyer
          ON lead_lawyer.tenant_id = matters.tenant_id
         AND lead_lawyer.user_id = matters.lead_lawyer_id
        LEFT JOIN users lead_partner
          ON lead_partner.tenant_id = matters.tenant_id
         AND lead_partner.user_id = matters.lead_partner_id
        LEFT JOIN users lead_associate
          ON lead_associate.tenant_id = matters.tenant_id
         AND lead_associate.user_id = matters.lead_associate_id
        WHERE ${filters.join(' AND ')}
        ORDER BY COALESCE(matters.opened_at, matters.created_at) DESC,
          matters.created_at DESC, matters.matter_id
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `,
      params,
    );

    return {
      items: result.rows.map(mapMatter),
      totalCount: Number(result.rows[0]?.total_count ?? '0'),
    };
  }
}

function asMatterState(status: string): MatterStateValue {
  if (isMatterState(status)) return status;
  throw validationFailed();
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw permissionDenied();
}
