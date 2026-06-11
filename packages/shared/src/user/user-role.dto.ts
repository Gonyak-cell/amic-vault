import { z } from 'zod';
import { userRoleSchema, type UserRole } from '../permission/roles';

export const assignUserRoleSchema = z.object({
  role: userRoleSchema,
});

export interface AssignUserRoleDto {
  role: UserRole;
}

