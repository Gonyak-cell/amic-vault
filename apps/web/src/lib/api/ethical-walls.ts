'use client';

import type {
  AddEthicalWallMembershipDto,
  CreateEthicalWallDto,
  EthicalWallDetailDto,
  EthicalWallListDto,
  EthicalWallMembershipDto,
  ListEthicalWallsQueryDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

function queryString(query: Partial<ListEthicalWallsQueryDto> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

export function listEthicalWalls(
  query: Partial<ListEthicalWallsQueryDto> = {},
): Promise<EthicalWallListDto> {
  return apiFetch<EthicalWallListDto>(`/ethical-walls${queryString(query)}`);
}

export function createEthicalWall(input: CreateEthicalWallDto): Promise<EthicalWallDetailDto> {
  return apiFetch<EthicalWallDetailDto>('/ethical-walls', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addEthicalWallMembership(
  wallId: string,
  input: AddEthicalWallMembershipDto,
): Promise<EthicalWallMembershipDto> {
  return apiFetch<EthicalWallMembershipDto>(`/ethical-walls/${wallId}/memberships`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeEthicalWallMembership(wallId: string, membershipId: string): Promise<void> {
  return apiFetch<void>(`/ethical-walls/${wallId}/memberships/${membershipId}`, {
    method: 'DELETE',
  });
}
