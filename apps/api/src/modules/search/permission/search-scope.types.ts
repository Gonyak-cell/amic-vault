import type { UserRole } from '@amic-vault/shared';
import type { SearchSqlFragment } from '../query/search-filter.builder';

export interface SearchPermissionActor {
  tenantId: string;
  userId: string;
  role: UserRole;
  materializedScope?: MaterializedSearchPermissionScope;
}

export interface MaterializedSearchPermissionScope {
  allowedMatterIds: readonly string[];
  deniedMatterIds: readonly string[];
  wallBlockedMatterIds: readonly string[];
  allowedDocumentIds: readonly string[];
  deniedDocumentIds: readonly string[];
}

export interface SearchScopeFilter extends SearchSqlFragment {
  appliedRules: string[];
}
