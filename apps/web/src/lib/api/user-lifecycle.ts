'use client';

import type { UserListDto, UserSummary } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function listUsers(): Promise<UserListDto> {
  return apiFetch<UserListDto>('/users');
}

export function deactivateUser(userId: string): Promise<UserSummary> {
  return apiFetch<UserSummary>(`/users/${userId}/deactivate`, { method: 'POST' });
}

export function reactivateUser(userId: string): Promise<UserSummary> {
  return apiFetch<UserSummary>(`/users/${userId}/reactivate`, { method: 'POST' });
}
