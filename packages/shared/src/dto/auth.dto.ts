import type { TenantId } from '../types/tenant';
import type { UserSummary } from '../types/user';

export interface LoginRequestDto {
  tenantId?: TenantId;
  tenantSlug?: string;
  email?: string;
  accountLedgerId?: string;
  password: string;
}

export interface LoginResponseDto {
  user: UserSummary;
  mfaEnabled: boolean;
}

export interface CurrentUserResponseDto {
  user: UserSummary;
}

export interface PasswordResetRequestDto {
  tenantId?: TenantId;
  tenantSlug?: string;
  email: string;
}

export interface PasswordResetConfirmDto {
  token: string;
  password: string;
}

export interface PasswordResetAcceptedDto {
  accepted: true;
}
