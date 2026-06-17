import {
  Archive,
  CheckSquare,
  FileText,
  FolderKanban,
  History,
  MailCheck,
  Search,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@amic-vault/shared';
import type { Language } from '@/lib/i18n';
import { canShowRouteInNavigation, routeVisibilityPolicies } from '@/lib/features';

export type NavigationGroupKey = 'Vault' | 'Governance' | 'Audit' | 'Security' | 'Integrations';

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

const groupLabels = {
  Vault: { ko: 'Vault', en: 'Vault' },
  Governance: { ko: 'Governance', en: 'Governance' },
  Audit: { ko: 'Audit', en: 'Audit' },
  Security: { ko: 'Security', en: 'Security' },
  Integrations: { ko: 'Integrations', en: 'Integrations' },
} as const satisfies Record<NavigationGroupKey, Record<Language, string>>;

const routeNavigation = {
  '/dashboard': {
    group: 'Vault',
    icon: CheckSquare,
    label: { ko: '홈', en: 'Home' },
  },
  '/matters': {
    group: 'Vault',
    icon: FolderKanban,
    label: { ko: 'Matter', en: 'Matters' },
  },
  '/search': {
    group: 'Vault',
    icon: Search,
    label: { ko: '검색', en: 'Search' },
  },
  '/records': {
    group: 'Governance',
    icon: Archive,
    label: { ko: '기록 보존', en: 'Records' },
  },
  '/audit': {
    group: 'Audit',
    icon: History,
    label: { ko: '접근 기록', en: 'Access logs' },
  },
  '/walls': {
    group: 'Security',
    icon: Shield,
    label: { ko: '정보 차단', en: 'Information barriers' },
  },
  '/files': {
    group: 'Vault',
    icon: FileText,
    label: { ko: '파일', en: 'Files' },
  },
  '/integrations/outlook': {
    group: 'Integrations',
    icon: MailCheck,
    label: { ko: 'Outlook', en: 'Outlook' },
  },
} as const;

const groupOrder: NavigationGroupKey[] = ['Vault', 'Governance', 'Audit', 'Security', 'Integrations'];

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
      label: item.label[language],
    });
  }

  return groupOrder
    .map((key) => ({
      key,
      label: groupLabels[key][language],
      items: groups.get(key) ?? [],
    }))
    .filter((group) => group.items.length > 0);
}
