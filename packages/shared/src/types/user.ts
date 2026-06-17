import type { TenantId } from './tenant';
import type { UserRole } from '../permission/roles';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

export const userStatuses = ['active', 'inactive', 'locked'] as const;

export type UserStatus = (typeof userStatuses)[number];

export interface UserSummary extends DisplayFieldsDto {
  userId: string;
  tenantId: TenantId;
  email: string;
  name: string;
  role: UserRole;
  practiceGroup: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}
