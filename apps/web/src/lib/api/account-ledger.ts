'use client';

import type { AssignAccountLedgerIdDto, UserSummary } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function assignAccountLedgerId(
  userId: string,
  input: AssignAccountLedgerIdDto,
): Promise<UserSummary> {
  return apiFetch<UserSummary>(`/users/${userId}/account-ledger-id`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
