import type { RolePermissionAction } from './permission-actions';
import { rolePermissionActions } from './permission-actions';
import type { UserRole } from './roles';
import { userRoles } from './roles';

export type RolePermissionDecision = 'allow' | 'deny' | 'member' | 'owner' | 'edit';

export type RolePermissionMatrix = Record<
  RolePermissionAction,
  Record<UserRole, RolePermissionDecision>
>;

const denyAll = (): Record<UserRole, RolePermissionDecision> => ({
  firm_admin: 'deny',
  security_admin: 'deny',
  matter_owner: 'deny',
  matter_member: 'deny',
  limited_reviewer: 'deny',
  knowledge_manager: 'deny',
  external_user: 'deny',
});

function row(
  overrides: Partial<Record<UserRole, RolePermissionDecision>>,
): Record<UserRole, RolePermissionDecision> {
  return { ...denyAll(), ...overrides };
}

export const rolePermissionMatrix: RolePermissionMatrix = {
  'tenant.settings_read': row({ firm_admin: 'allow', security_admin: 'allow' }),
  'tenant.settings_update': row({ firm_admin: 'allow' }),
  'user.create_invite': row({ firm_admin: 'allow' }),
  'group.manage': row({ firm_admin: 'allow', security_admin: 'allow' }),
  'client.create': row({ firm_admin: 'allow', matter_owner: 'allow' }),
  'client.read': row({
    firm_admin: 'allow',
    security_admin: 'allow',
    matter_owner: 'allow',
    matter_member: 'allow',
    knowledge_manager: 'allow',
  }),
  'client.update': row({ firm_admin: 'allow', matter_owner: 'allow' }),
  'matter.create': row({ firm_admin: 'allow', matter_owner: 'allow' }),
  'matter.read': row({
    firm_admin: 'member',
    security_admin: 'member',
    matter_owner: 'member',
    matter_member: 'member',
    limited_reviewer: 'member',
    knowledge_manager: 'member',
  }),
  'search.query': row({
    firm_admin: 'member',
    security_admin: 'member',
    matter_owner: 'member',
    matter_member: 'member',
    limited_reviewer: 'member',
    knowledge_manager: 'member',
  }),
  'matter.edit': row({ matter_owner: 'edit', matter_member: 'edit' }),
  'matter.status_change': row({ matter_owner: 'edit', matter_member: 'edit' }),
  'matter.close': row({ matter_owner: 'owner' }),
  'matter.archive': row({ matter_owner: 'owner' }),
  'matter.reopen': row({ firm_admin: 'allow' }),
  'matter.member_add': row({ matter_owner: 'owner' }),
  'matter.member_remove': row({ matter_owner: 'owner' }),
  'matter.member_role_change': row({ matter_owner: 'owner' }),
  'party.create': row({ matter_owner: 'edit', matter_member: 'edit' }),
  'party.restrict': row({ security_admin: 'allow', matter_owner: 'owner' }),
  'permission.grant': row({ security_admin: 'allow', matter_owner: 'owner' }),
  'permission.revoke': row({ security_admin: 'allow', matter_owner: 'owner' }),
  'user.role_assign': row({ firm_admin: 'allow' }),
  'wall.create': row({ security_admin: 'allow' }),
  'wall.manage': row({ security_admin: 'allow' }),
  'wall.release': row({ security_admin: 'allow' }),
  'audit.read.tenant': row({ firm_admin: 'allow', security_admin: 'allow' }),
  'audit.read.matter': row({ firm_admin: 'allow', security_admin: 'allow', matter_owner: 'owner' }),
};

export function rolePermissionDecision(
  role: UserRole,
  action: RolePermissionAction,
): RolePermissionDecision {
  return rolePermissionMatrix[action]?.[role] ?? 'deny';
}

export function isRoleAllowedForAction(role: UserRole, action: RolePermissionAction): boolean {
  return rolePermissionDecision(role, action) !== 'deny';
}

export function assertCompleteRolePermissionMatrix(): void {
  for (const action of rolePermissionActions) {
    const rowForAction = rolePermissionMatrix[action];
    if (!rowForAction) {
      throw new Error(`missing role permission action: ${action}`);
    }
    for (const role of userRoles) {
      if (!rowForAction[role]) {
        throw new Error(`missing role ${role} for action ${action}`);
      }
    }
  }
}
