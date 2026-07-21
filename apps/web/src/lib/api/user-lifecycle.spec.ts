import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import { deactivateUser, listUsers, reactivateUser } from './user-lifecycle';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ init, path })),
}));

describe('user lifecycle API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists tenant users through the admin directory endpoint', async () => {
    await listUsers();

    expect(apiFetch).toHaveBeenCalledWith('/users');
  });

  it('posts deactivate and reactivate lifecycle actions', async () => {
    await deactivateUser('11111111-1111-4111-8111-111111111103');
    await reactivateUser('11111111-1111-4111-8111-111111111103');

    expect(apiFetch).toHaveBeenCalledWith('/users/11111111-1111-4111-8111-111111111103/deactivate', {
      method: 'POST',
    });
    expect(apiFetch).toHaveBeenCalledWith('/users/11111111-1111-4111-8111-111111111103/reactivate', {
      method: 'POST',
    });
  });
});
