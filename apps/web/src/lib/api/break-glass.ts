'use client';

import type {
  BreakGlassRequestDto,
  BreakGlassRequestListDto,
  BreakGlassRequestStatus,
  CreateBreakGlassRequestDto,
  RevokeBreakGlassRequestDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function listBreakGlassRequests(input: { status?: BreakGlassRequestStatus } = {}) {
  const query = input.status ? `?${new URLSearchParams({ status: input.status }).toString()}` : '';
  return apiFetch<BreakGlassRequestListDto>(`/break-glass/requests${query}`);
}

export function createBreakGlassRequest(
  input: CreateBreakGlassRequestDto,
): Promise<BreakGlassRequestDto> {
  return apiFetch<BreakGlassRequestDto>('/break-glass/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveBreakGlassRequest(requestId: string): Promise<BreakGlassRequestDto> {
  return apiFetch<BreakGlassRequestDto>(`/break-glass/requests/${requestId}/approvals`, {
    method: 'POST',
  });
}

export function revokeBreakGlassRequest(
  requestId: string,
  input: RevokeBreakGlassRequestDto = {},
): Promise<BreakGlassRequestDto> {
  return apiFetch<BreakGlassRequestDto>(`/break-glass/requests/${requestId}/revoke`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
