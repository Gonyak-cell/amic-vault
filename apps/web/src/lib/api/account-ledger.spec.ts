import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import { assignAccountLedgerId } from './account-ledger';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init: RequestInit) => ({ init, path })),
}));

describe('account ledger API client', () => {
  it('patches the selected user with the bounded account ledger id body', async () => {
    await assignAccountLedgerId('11111111-1111-4111-8111-111111111104', {
      accountLedgerId: 'amic-alpha-001',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/users/11111111-1111-4111-8111-111111111104/account-ledger-id',
      {
        method: 'PATCH',
        body: JSON.stringify({ accountLedgerId: 'amic-alpha-001' }),
      },
    );
  });
});
