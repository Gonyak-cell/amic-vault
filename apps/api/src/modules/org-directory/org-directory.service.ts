import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  OrgDirectorySubjectDto,
  OrgDirectorySubjectListDto,
  OrgDirectorySubjectQueryDto,
  TenantId,
  UserRole,
} from '@amic-vault/shared';
import { buildSafeLabel, isUserRole } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';

export interface OrgDirectoryRequestContext {
  sessionId?: string | null;
  tenantId: string;
  userId: string;
}

interface ActorRow {
  role: string;
  status: string;
}

interface UserSubjectRow {
  email: string;
  name: string;
  practice_group: string | null;
  role: string;
  user_id: string;
}

interface GroupSubjectRow {
  group_id: string;
  group_type: 'practice_group' | 'team' | 'custom';
  name: string;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function isAdminRole(role: UserRole): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function likePattern(input: string): string {
  const escaped = input
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${escaped}%`;
}

@Injectable()
export class OrgDirectoryService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
  ) {}

  async searchSubjects(
    ctx: OrgDirectoryRequestContext,
    input: OrgDirectorySubjectQueryDto,
  ): Promise<OrgDirectorySubjectListDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const actor = await this.lookupActor(client, ctx);
      if (!actor || actor.status !== 'active' || !isUserRole(actor.role)) {
        throw permissionDenied();
      }
      if (actor.role === 'external_user') throw permissionDenied();
      await this.assertPurposeAllowed(ctx, input, actor.role);

      const items: OrgDirectorySubjectDto[] = [];
      const pattern = likePattern(input.q);
      const subjectType = input.subjectType ?? 'all';
      if (subjectType === 'all' || subjectType === 'user') {
        items.push(...(await this.searchUsers(client, ctx.tenantId, pattern, input.limit)));
      }
      if (subjectType === 'all' || subjectType === 'group') {
        items.push(...(await this.searchGroups(client, ctx.tenantId, pattern, input.limit)));
      }

      return {
        items: items
          .sort((a, b) => {
            const left = a.displayName ?? a.safeLabel ?? '';
            const right = b.displayName ?? b.safeLabel ?? '';
            return left.localeCompare(right);
          })
          .slice(0, input.limit),
      };
    });
  }

  private async assertPurposeAllowed(
    ctx: OrgDirectoryRequestContext,
    input: OrgDirectorySubjectQueryDto,
    role: UserRole,
  ): Promise<void> {
    if (input.purpose === 'ethical-wall') {
      if (role !== 'security_admin') throw permissionDenied();
      return;
    }
    if (input.purpose === 'records') {
      if (!isAdminRole(role)) throw permissionDenied();
      return;
    }
    if (!input.matterId) throw permissionDenied();
    const decision = await this.permissionService.canManageMatterMembers(
      { tenantId: ctx.tenantId as TenantId, userId: ctx.userId },
      input.matterId,
    );
    if (decision.effect !== 'ALLOW') throw permissionDenied();
  }

  private async lookupActor(
    client: QueryClient,
    ctx: OrgDirectoryRequestContext,
  ): Promise<ActorRow | null> {
    const result = await client.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    return (result.rows[0] as ActorRow | undefined) ?? null;
  }

  private async searchUsers(
    client: QueryClient,
    tenantId: string,
    pattern: string,
    limit: number,
  ): Promise<OrgDirectorySubjectDto[]> {
    const result = await client.query(
      `
        SELECT user_id, name, email, role, practice_group
        FROM users
        WHERE tenant_id = $1
          AND status = 'active'
          AND role <> 'external_user'
          AND (
            name ILIKE $2 ESCAPE '\\'
            OR email ILIKE $2 ESCAPE '\\'
            OR coalesce(practice_group, '') ILIKE $2 ESCAPE '\\'
          )
        ORDER BY lower(name) ASC, lower(email) ASC, user_id ASC
        LIMIT $3
      `,
      [tenantId, pattern, limit],
    );
    return (result.rows as UserSubjectRow[]).flatMap((row) => {
      if (!isUserRole(row.role)) return [];
      if (row.role === 'external_user') return [];
      return [
        {
          canViewSensitiveRef: false,
          displayEmail: row.email,
          displayName: row.name,
          role: row.role,
          safeLabel: buildSafeLabel(row.name, row.email),
          subjectId: row.user_id,
          subjectType: 'user',
        },
      ];
    });
  }

  private async searchGroups(
    client: QueryClient,
    tenantId: string,
    pattern: string,
    limit: number,
  ): Promise<OrgDirectorySubjectDto[]> {
    const result = await client.query(
      `
        SELECT group_id, name, group_type
        FROM groups
        WHERE tenant_id = $1
          AND (
            name ILIKE $2 ESCAPE '\\'
            OR group_type ILIKE $2 ESCAPE '\\'
          )
        ORDER BY lower(name) ASC, group_id ASC
        LIMIT $3
      `,
      [tenantId, pattern, limit],
    );
    return (result.rows as GroupSubjectRow[]).map((row) => ({
      canViewSensitiveRef: false,
      displayName: row.name,
      groupType: row.group_type,
      safeLabel: buildSafeLabel(row.name, row.group_type),
      subjectId: row.group_id,
      subjectType: 'group',
    }));
  }
}
