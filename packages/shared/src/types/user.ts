import type { TenantId } from './tenant';
import type { UserRole } from '../permission/roles';

export const userStatuses = ['active', 'inactive', 'locked'] as const;

export type UserStatus = (typeof userStatuses)[number];

export interface UserSummary {
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
