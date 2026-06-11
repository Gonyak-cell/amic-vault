import { Injectable } from '@nestjs/common';
import type { SearchSqlFragment } from '../query/search-filter.builder';

export interface SearchRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

export type SearchPermissionScopeDecision =
  | { effect: 'DENY'; reasonCode: 'DENY_ALL' | 'SCOPE_ERROR' }
  | { effect: 'ALLOW'; scope: SearchSqlFragment };

export interface SearchPermissionScopeProvider {
  scopeForSearch(ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision>;
}

export const SEARCH_PERMISSION_SCOPE_PROVIDER = Symbol('SEARCH_PERMISSION_SCOPE_PROVIDER');

@Injectable()
export class DenyAllSearchPermissionScopeProvider implements SearchPermissionScopeProvider {
  async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
    return { effect: 'DENY', reasonCode: 'DENY_ALL' };
  }
}
