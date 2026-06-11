import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@amic-vault/shared';

export const REQUIRED_ROLES_KEY = 'amic-vault:required-roles';

export function RequireRoles(...roles: UserRole[]) {
  return SetMetadata(REQUIRED_ROLES_KEY, roles);
}

