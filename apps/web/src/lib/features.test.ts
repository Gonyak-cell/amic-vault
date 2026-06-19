import { describe, expect, it } from 'vitest';
import {
  canRoleViewRoute,
  findRouteVisibilityPolicy,
  routeVisibilityPolicies,
} from './features';

describe('route visibility policies', () => {
  it('uses /admin as the canonical admin settings route with /enterprise as a hidden compatibility route', () => {
    expect(findRouteVisibilityPolicy('/admin')).toMatchObject({
      group: 'Admin',
      production: 'visible_admin_only',
      showInNavigation: true,
    });
    expect(findRouteVisibilityPolicy('/admin/security')).toMatchObject({
      group: 'Admin',
      production: 'visible_admin_only',
      showInNavigation: false,
    });
    expect(findRouteVisibilityPolicy('/enterprise')).toMatchObject({
      group: 'Admin',
      production: 'visible_admin_only',
      showInNavigation: false,
    });
  });

  it('keeps admin settings limited to admin roles', () => {
    const policy = findRouteVisibilityPolicy('/admin');
    expect(policy).toBeDefined();
    if (!policy) throw new Error('missing admin route policy');

    expect(canRoleViewRoute(policy, 'firm_admin')).toBe(true);
    expect(canRoleViewRoute(policy, 'security_admin')).toBe(true);
    expect(canRoleViewRoute(policy, 'matter_owner')).toBe(false);
    expect(canRoleViewRoute(policy, 'matter_member')).toBe(false);
    expect(canRoleViewRoute(policy, undefined)).toBe(false);
  });

  it('shows the work queue to internal users without admin-only escalation', () => {
    const policy = findRouteVisibilityPolicy('/work');
    expect(policy).toMatchObject({
      group: 'Vault',
      production: 'visible',
      showInNavigation: true,
    });
    if (!policy) throw new Error('missing work route policy');

    expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
    expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
    expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
  });

  it('shows notifications to internal users without admin-only escalation', () => {
    const policy = findRouteVisibilityPolicy('/notifications');
    expect(policy).toMatchObject({
      group: 'Vault',
      production: 'visible',
      showInNavigation: true,
    });
    if (!policy) throw new Error('missing notifications route policy');

    expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
    expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
    expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
  });

  it('shows search folders to internal users as a production Vault route', () => {
    const policy = findRouteVisibilityPolicy('/search/folders');
    expect(policy).toMatchObject({
      group: 'Vault',
      production: 'visible',
      showInNavigation: true,
    });
    if (!policy) throw new Error('missing search folders route policy');

    expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
    expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
    expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
  });

  it('keeps hidden internal and out-of-scope routes blocked by policy', () => {
    for (const route of ['/launch', '/scale', '/contracts', '/dd', '/litigation']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toBeDefined();
      if (!policy) continue;
      expect(canRoleViewRoute(policy, 'firm_admin')).toBe(false);
    }
  });

  it('keeps legacy enterprise policy out of primary navigation', () => {
    const policyRoutes: readonly string[] = routeVisibilityPolicies.map((policy) => policy.route);
    const staleRoutes = policyRoutes.filter((route) => route === '/admin-old');

    expect(staleRoutes).toEqual([]);
    expect(findRouteVisibilityPolicy('/enterprise')?.showInNavigation).toBe(false);
  });

  it('keeps external portal routes out of internal production navigation policy', () => {
    const policyRoutes: readonly string[] = routeVisibilityPolicies.map((policy) => policy.route);

    expect(findRouteVisibilityPolicy('/external/[token]')).toBeUndefined();
    expect(policyRoutes.some((route) => route.startsWith('/external'))).toBe(false);
  });
});
