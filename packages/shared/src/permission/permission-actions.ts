import { z } from 'zod';

export const rolePermissionActions = [
  'tenant.settings_read',
  'tenant.settings_update',
  'user.create_invite',
  'group.manage',
  'client.create',
  'client.read',
  'client.update',
  'matter.create',
  'matter.read',
  'search.query',
  'matter.edit',
  'matter.status_change',
  'matter.close',
  'matter.archive',
  'matter.reopen',
  'matter.member_add',
  'matter.member_remove',
  'matter.member_role_change',
  'party.create',
  'party.restrict',
  'permission.grant',
  'permission.revoke',
  'user.role_assign',
  'wall.create',
  'wall.manage',
  'wall.release',
  'audit.read.tenant',
  'audit.read.matter',
] as const;

export type RolePermissionAction = (typeof rolePermissionActions)[number];

export const rolePermissionActionSchema = z.enum(rolePermissionActions);

export function isRolePermissionAction(value: string): value is RolePermissionAction {
  return (rolePermissionActions as readonly string[]).includes(value);
}
