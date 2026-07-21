import type { TenantId } from '../types/tenant';
import type { UserSummary } from '../types/user';

export interface LoginRequestDto {
  tenantId?: TenantId;
  tenantSlug?: string;
  email?: string;
  accountLedgerId?: string;
  password: string;
}

export interface LoginCompleteResponseDto {
  user: UserSummary;
  mfaEnabled: boolean;
  mfaRequired?: false;
}

export interface LoginMfaRequiredResponseDto {
  mfaRequired: true;
  mfaEnabled: true;
  mfaChallengeId: string;
}

export type LoginResponseDto = LoginCompleteResponseDto | LoginMfaRequiredResponseDto;

export interface MfaVerifyRequestDto {
  challengeId: string;
  code: string;
}

export interface MfaEnrollResponseDto {
  secretId: string;
  otpauthUri: string;
  manualEntryKey: string;
  recoveryCodes: string[];
}

export interface MfaActivateRequestDto {
  secretId: string;
  code: string;
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
