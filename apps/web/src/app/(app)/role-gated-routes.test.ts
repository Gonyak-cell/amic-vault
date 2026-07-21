import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import { safeApiErrorMessage, uiErrorStateForApiError } from '@/lib/api/error-messages';
import { canRoleViewRoute, findRouteVisibilityPolicy } from '@/lib/features';

describe('role-gated matter workstream routes', () => {
  it('opens contracts, DD, and litigation only for internal roles', () => {
    for (const route of ['/contracts', '/dd', '/litigation']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toMatchObject({
        production: 'visible_limited',
        showInNavigation: false,
      });
      if (!policy) continue;

      expect(canRoleViewRoute(policy, 'matter_owner')).toBe(true);
      expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
      expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
      expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
      expect(canRoleViewRoute(policy, undefined)).toBe(false);
    }
  });

  it('maps matter permission denials to safe no-access UI state', () => {
    const denied = new ApiClientError(403, { code: 'PERMISSION_DENIED' });

    expect(uiErrorStateForApiError(denied)).toMatchObject({
      dataStatus: 'forbidden',
      emptyStateVariant: 'no-access',
      kind: 'permission',
    });
    expect(safeApiErrorMessage(denied)).toBe('접근 상태를 확인할 수 없습니다.');
    expect(safeApiErrorMessage(denied)).not.toContain('PERMISSION_DENIED');
  });
});
