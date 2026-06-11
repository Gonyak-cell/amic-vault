import type { TenantId } from './tenant';

export const userStatuses = ['active', 'inactive', 'locked'] as const;

export type UserStatus = (typeof userStatuses)[number];

export interface UserSummary {
  userId: string;
  tenantId: TenantId;
  email: string;
  name: string;
  role: string;
  practiceGroup: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}
