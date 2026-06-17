import type { UserRole } from '@amic-vault/shared';

export type RouteProductionVisibility =
  | 'visible'
  | 'visible_admin_only'
  | 'visible_limited'
  | 'hidden_until_api_ready'
  | 'hidden';

export interface RouteVisibilityPolicy {
  route: string;
  group: 'Vault' | 'Governance' | 'Audit' | 'Security' | 'Admin' | 'Integrations' | 'AI Prep/Ops' | 'Internal Ops' | 'Out of scope';
  production: RouteProductionVisibility;
  roles: readonly UserRole[];
  showInNavigation: boolean;
}

export const internalUserRoles = [
  'firm_admin',
  'security_admin',
  'matter_owner',
  'matter_member',
  'limited_reviewer',
  'knowledge_manager',
] as const satisfies readonly UserRole[];

const adminRoles = ['firm_admin', 'security_admin'] as const satisfies readonly UserRole[];

export const routeVisibilityPolicies = [
  {
    route: '/dashboard',
    group: 'Vault',
    production: 'visible',
    roles: internalUserRoles,
    showInNavigation: true,
  },
  {
    route: '/matters',
    group: 'Vault',
    production: 'visible',
    roles: internalUserRoles,
    showInNavigation: true,
  },
  {
    route: '/files',
    group: 'Vault',
    production: 'hidden_until_api_ready',
    roles: internalUserRoles,
    showInNavigation: false,
  },
  {
    route: '/search',
    group: 'Vault',
    production: 'visible',
    roles: internalUserRoles,
    showInNavigation: true,
  },
  {
    route: '/records',
    group: 'Governance',
    production: 'visible_admin_only',
    roles: ['firm_admin', 'security_admin', 'matter_owner'],
    showInNavigation: true,
  },
  {
    route: '/audit',
    group: 'Audit',
    production: 'visible_admin_only',
    roles: adminRoles,
    showInNavigation: true,
  },
  {
    route: '/walls',
    group: 'Security',
    production: 'visible_admin_only',
    roles: adminRoles,
    showInNavigation: true,
  },
  {
    route: '/admin',
    group: 'Admin',
    production: 'visible_admin_only',
    roles: adminRoles,
    showInNavigation: false,
  },
  {
    route: '/integrations/outlook',
    group: 'Integrations',
    production: 'visible_admin_only',
    roles: adminRoles,
    showInNavigation: false,
  },
  {
    route: '/integrations/onedrive',
    group: 'Integrations',
    production: 'hidden_until_api_ready',
    roles: adminRoles,
    showInNavigation: false,
  },
  {
    route: '/ai-prep',
    group: 'AI Prep/Ops',
    production: 'visible_limited',
    roles: ['firm_admin', 'security_admin', 'matter_owner', 'knowledge_manager'],
    showInNavigation: false,
  },
  {
    route: '/launch',
    group: 'Internal Ops',
    production: 'hidden',
    roles: ['firm_admin'],
    showInNavigation: false,
  },
  {
    route: '/scale',
    group: 'Internal Ops',
    production: 'hidden',
    roles: ['firm_admin'],
    showInNavigation: false,
  },
  {
    route: '/contracts',
    group: 'Out of scope',
    production: 'hidden',
    roles: ['firm_admin'],
    showInNavigation: false,
  },
  {
    route: '/dd',
    group: 'Out of scope',
    production: 'hidden',
    roles: ['firm_admin'],
    showInNavigation: false,
  },
  {
    route: '/litigation',
    group: 'Out of scope',
    production: 'hidden',
    roles: ['firm_admin'],
    showInNavigation: false,
  },
] as const satisfies readonly RouteVisibilityPolicy[];

export function canRoleViewRoute(policy: RouteVisibilityPolicy, role: UserRole | null | undefined): boolean {
  if (policy.production === 'hidden' || policy.production === 'hidden_until_api_ready') return false;
  if (!role) return policy.route === '/dashboard';
  return policy.roles.includes(role);
}

export function canShowRouteInNavigation(
  policy: RouteVisibilityPolicy,
  role: UserRole | null | undefined,
): boolean {
  return policy.showInNavigation && canRoleViewRoute(policy, role);
}
