import { describe, expect, it } from 'vitest';
import {
  canRoleViewRoute,
  findRouteVisibilityPolicy,
  routeVisibilityPolicies,
} from './features';

describe('route visibility policies', () => {
  it('uses the real enterprise admin route instead of a stale admin placeholder', () => {
    expect(findRouteVisibilityPolicy('/admin')).toBeUndefined();
    expect(findRouteVisibilityPolicy('/enterprise')).toMatchObject({
      group: 'Admin',
      production: 'visible_admin_only',
      showInNavigation: true,
    });
  });

  it('keeps admin settings limited to admin roles', () => {
    const policy = findRouteVisibilityPolicy('/enterprise');
    expect(policy).toBeDefined();
    if (!policy) throw new Error('missing enterprise route policy');

    expect(canRoleViewRoute(policy, 'firm_admin')).toBe(true);
    expect(canRoleViewRoute(policy, 'security_admin')).toBe(true);
    expect(canRoleViewRoute(policy, 'matter_owner')).toBe(false);
    expect(canRoleViewRoute(policy, 'matter_member')).toBe(false);
    expect(canRoleViewRoute(policy, undefined)).toBe(false);
  });

  it('keeps hidden internal and out-of-scope routes blocked by policy', () => {
    for (const route of ['/launch', '/scale', '/contracts', '/dd', '/litigation']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toBeDefined();
      if (!policy) continue;
      expect(canRoleViewRoute(policy, 'firm_admin')).toBe(false);
    }
  });

  it('does not keep policies for routes that are not part of the app inventory', () => {
    const policyRoutes: readonly string[] = routeVisibilityPolicies.map((policy) => policy.route);
    const staleRoutes = policyRoutes.filter((route) => route === '/admin');

    expect(staleRoutes).toEqual([]);
  });
});
