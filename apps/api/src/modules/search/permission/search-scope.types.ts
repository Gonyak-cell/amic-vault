import type { UserRole } from '@amic-vault/shared';
import type { SearchSqlFragment } from '../query/search-filter.builder';

export interface SearchPermissionActor {
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface SearchScopeFilter extends SearchSqlFragment {
  appliedRules: string[];
}
