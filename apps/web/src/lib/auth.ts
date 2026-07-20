'use client';

import type {
  CurrentUserResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  MfaActivateRequestDto,
  MfaEnrollResponseDto,
  MfaVerifyRequestDto,
  PasswordResetAcceptedDto,
  PasswordResetConfirmDto,
} from '@amic-vault/shared';
import { apiFetch } from './api-client';

export function login(input: LoginRequestDto): Promise<LoginResponseDto> {
  return apiFetch<LoginResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function verifyMfaChallenge(input: MfaVerifyRequestDto): Promise<LoginResponseDto> {
  return apiFetch<LoginResponseDto>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function enrollMfa(): Promise<MfaEnrollResponseDto> {
  return apiFetch<MfaEnrollResponseDto>('/auth/mfa/enroll', { method: 'POST' });
}

export function activateMfa(input: MfaActivateRequestDto): Promise<{ accepted: true }> {
  return apiFetch<{ accepted: true }>('/auth/mfa/activate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<PasswordResetAcceptedDto> {
  return apiFetch<PasswordResetAcceptedDto>('/auth/logout', {
    method: 'POST',
    redirectOnAuthRequired: false,
  });
}

export function getCurrentUser(): Promise<CurrentUserResponseDto> {
  return apiFetch<CurrentUserResponseDto>('/auth/me');
}

export function confirmPasswordReset(
  input: PasswordResetConfirmDto,
): Promise<PasswordResetAcceptedDto> {
  return apiFetch<PasswordResetAcceptedDto>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}
