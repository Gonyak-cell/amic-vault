import {
  Archive,
  CheckSquare,
  FileText,
  FolderKanban,
  History,
  MailCheck,
  Search,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@amic-vault/shared';
import { getTranslation, type Language, type TranslationKey } from '@/lib/i18n';
import { canShowRouteInNavigation, routeVisibilityPolicies } from '@/lib/features';

export type NavigationGroupKey =
  | 'Vault'
  | 'Governance'
  | 'Audit'
  | 'Security'
  | 'Admin'
  | 'Integrations'
  | 'AI Prep/Ops';

export interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export interface NavigationGroup {
  key: NavigationGroupKey;
  label: string;
  items: NavigationItem[];
}

const groupLabelKeys = {
  Vault: 'nav.group.vault',
  Governance: 'nav.group.governance',
  Audit: 'nav.group.audit',
  Security: 'nav.group.security',
  Admin: 'nav.group.admin',
  Integrations: 'nav.group.integrations',
  'AI Prep/Ops': 'nav.group.aiPrep',
} as const satisfies Record<NavigationGroupKey, TranslationKey>;

const routeNavigation = {
  '/dashboard': {
    group: 'Vault',
    icon: CheckSquare,
    labelKey: 'nav.dashboard',
  },
  '/matters': {
    group: 'Vault',
    icon: FolderKanban,
    labelKey: 'nav.matters',
  },
  '/search': {
    group: 'Vault',
    icon: Search,
    labelKey: 'nav.search',
  },
  '/records': {
    group: 'Governance',
    icon: Archive,
    labelKey: 'nav.records',
  },
  '/audit': {
    group: 'Audit',
    icon: History,
    labelKey: 'nav.audit',
  },
  '/walls': {
    group: 'Security',
    icon: Shield,
    labelKey: 'nav.walls',
  },
  '/admin': {
    group: 'Admin',
    icon: Settings,
    labelKey: 'nav.enterprise',
  },
  '/files': {
    group: 'Vault',
    icon: FileText,
    labelKey: 'nav.files',
  },
  '/integrations/outlook': {
    group: 'Integrations',
    icon: MailCheck,
    labelKey: 'nav.outlook',
  },
} as const;

const groupOrder: NavigationGroupKey[] = [
  'Vault',
  'Governance',
  'Audit',
  'Security',
  'Admin',
  'Integrations',
  'AI Prep/Ops',
];

export function getNavigationGroups(
  role: UserRole | null | undefined,
  language: Language,
): NavigationGroup[] {
  const groups = new Map<NavigationGroupKey, NavigationItem[]>();
  for (const key of groupOrder) {
    groups.set(key, []);
  }

  for (const policy of routeVisibilityPolicies) {
    if (!canShowRouteInNavigation(policy, role)) continue;
    const item = routeNavigation[policy.route as keyof typeof routeNavigation];
    if (!item) continue;
    groups.get(item.group)?.push({
      href: policy.route,
      icon: item.icon,
      label: getTranslation(item.labelKey, language),
    });
  }

  return groupOrder
    .map((key) => ({
      key,
      label: getTranslation(groupLabelKeys[key], language),
      items: groups.get(key) ?? [],
    }))
    .filter((group) => group.items.length > 0);
}
