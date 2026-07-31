import { describe, expect, it, vi } from 'vitest';
import type { TenantId, UserRole, UserSummary } from '@amic-vault/shared';
import { resolveRouteVisibility } from './route-visibility-guard';

function user(role: UserRole): UserSummary {
  return {
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
    email: `${role}@test.local`,
    name: role,
    role,
    practiceGroup: null,
    status: 'active',
    mfaEnabled: false,
    lastLoginAt: null,
  };
}

describe('resolveRouteVisibility', () => {
  it('allows an administrator on an administration deep link', async () => {
    const loadCurrentUser = vi.fn(async () => ({ user: user('firm_admin') }));

    await expect(resolveRouteVisibility('/integrations/matter-app', loadCurrentUser)).resolves.toEqual(
      {
        status: 'allowed',
        user: user('firm_admin'),
      },
    );
  });

  it('blocks an ordinary member on the same deep link', async () => {
    const loadCurrentUser = vi.fn(async () => ({ user: user('matter_member') }));

    await expect(
      resolveRouteVisibility('/integrations/matter-app', loadCurrentUser),
    ).resolves.toEqual({ status: 'blocked' });
  });

  it('fails closed when current-user lookup fails', async () => {
    const loadCurrentUser = vi.fn(async () => {
      throw new Error('session lookup unavailable');
    });

    await expect(resolveRouteVisibility('/audit', loadCurrentUser)).resolves.toEqual({
      status: 'blocked',
    });
  });
});
