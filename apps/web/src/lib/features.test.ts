import { describe, expect, it } from 'vitest';
import { canRoleViewRoute, findRouteVisibilityPolicy, routeVisibilityPolicies } from './features';

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

  it('keeps notifications available to internal users but out of primary navigation', () => {
    const policy = findRouteVisibilityPolicy('/notifications');
    expect(policy).toMatchObject({
      group: 'Vault',
      production: 'visible',
      showInNavigation: false,
    });
    if (!policy) throw new Error('missing notifications route policy');

    expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
    expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
    expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
  });

  it('shows clients to internal users as a production Vault route', () => {
    const policy = findRouteVisibilityPolicy('/clients');
    expect(policy).toMatchObject({
      group: 'Vault',
      production: 'visible',
      showInNavigation: true,
    });
    if (!policy) throw new Error('missing clients route policy');

    expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
    expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
    expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
  });

  it('keeps search routes available to internal users but out of primary navigation', () => {
    for (const route of ['/search', '/search/folders']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toMatchObject({
        group: 'Vault',
        production: 'visible',
        showInNavigation: false,
      });
      if (!policy) continue;

      expect(canRoleViewRoute(policy, 'matter_member')).toBe(true);
      expect(canRoleViewRoute(policy, 'limited_reviewer')).toBe(true);
      expect(canRoleViewRoute(policy, 'external_user')).toBe(false);
    }
  });

  it('keeps admin capability routes authorized but out of primary navigation', () => {
    for (const [route, matterOwnerAllowed] of [
      ['/records', true],
      ['/audit', false],
      ['/integrations/outlook', false],
    ] as const) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toMatchObject({
        production: 'visible_admin_only',
        showInNavigation: false,
      });
      if (!policy) continue;

      expect(canRoleViewRoute(policy, 'firm_admin')).toBe(true);
      expect(canRoleViewRoute(policy, 'security_admin')).toBe(true);
      expect(canRoleViewRoute(policy, 'matter_owner')).toBe(matterOwnerAllowed);
      expect(canRoleViewRoute(policy, 'matter_member')).toBe(false);
      expect(canRoleViewRoute(policy, undefined)).toBe(false);
    }
  });

  it('keeps hidden internal routes blocked by policy', () => {
    for (const route of ['/launch', '/scale']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toBeDefined();
      if (!policy) continue;
      expect(canRoleViewRoute(policy, 'firm_admin')).toBe(false);
    }
  });

  it('exposes matter workstream entry routes only to internal roles', () => {
    for (const route of ['/contracts', '/dd', '/litigation']) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toMatchObject({
        group: 'Vault',
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

  it('keeps legacy enterprise policy out of primary navigation', () => {
    const policyRoutes: readonly string[] = routeVisibilityPolicies.map((policy) => policy.route);
    const staleRoutes = policyRoutes.filter((route) => route === '/admin-old');

    expect(staleRoutes).toEqual([]);
    expect(findRouteVisibilityPolicy('/enterprise')?.showInNavigation).toBe(false);
  });

  it('keeps old internal deep links governed even when they are absent from primary navigation', () => {
    const roleMatrix = {
      '/notifications': { allowed: 'matter_member', denied: 'external_user' },
      '/records': { allowed: 'matter_owner', denied: 'matter_member' },
      '/audit': { allowed: 'firm_admin', denied: 'matter_owner' },
      '/walls': { allowed: 'security_admin', denied: 'matter_member' },
      '/enterprise': { allowed: 'firm_admin', denied: 'matter_owner' },
      '/integrations': { allowed: 'firm_admin', denied: 'matter_member' },
      '/integrations/outlook': { allowed: 'security_admin', denied: 'matter_member' },
      '/integrations/matter-app': { allowed: 'firm_admin', denied: 'matter_member' },
      '/contracts': { allowed: 'matter_member', denied: 'external_user' },
      '/dd': { allowed: 'matter_member', denied: 'external_user' },
      '/litigation': { allowed: 'matter_member', denied: 'external_user' },
    } as const;

    for (const [route, roles] of Object.entries(roleMatrix)) {
      const policy = findRouteVisibilityPolicy(route);
      expect(policy, `${route} policy`).toBeDefined();
      if (!policy) continue;

      expect(policy.showInNavigation, route).toBe(false);
      expect(canRoleViewRoute(policy, roles.allowed), `${route} allowed`).toBe(true);
      expect(canRoleViewRoute(policy, roles.denied), `${route} denied`).toBe(false);
      expect(canRoleViewRoute(policy, undefined), `${route} loading`).toBe(false);
    }
  });

  it('keeps external portal routes out of internal production navigation policy', () => {
    const policyRoutes: readonly string[] = routeVisibilityPolicies.map((policy) => policy.route);

    expect(findRouteVisibilityPolicy('/external/[token]')).toBeUndefined();
    expect(policyRoutes.some((route) => route.startsWith('/external'))).toBe(false);
  });
});
