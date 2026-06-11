import { z } from 'zod';

export const userRoles = [
  'firm_admin',
  'security_admin',
  'matter_owner',
  'matter_member',
  'limited_reviewer',
  'knowledge_manager',
  'external_user',
] as const;

export type UserRole = (typeof userRoles)[number];

export const userRoleSchema = z.enum(userRoles);

export function isUserRole(value: string): value is UserRole {
  return (userRoles as readonly string[]).includes(value);
}

export function canIssueSessionForRole(role: UserRole): boolean {
  return role !== 'external_user';
}

