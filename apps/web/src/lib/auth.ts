'use client';

import type {
  CurrentUserResponseDto,
  LoginRequestDto,
  LoginResponseDto,
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
