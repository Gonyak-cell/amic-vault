'use client';

import type { SearchAdminHealthDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export interface TenantSearchReindexResult {
  accepted: true;
  enqueuedJobCount: number;
  scopeId: string;
  scopeType: 'tenant';
}

export function requestTenantSearchReindex(): Promise<TenantSearchReindexResult> {
  return apiFetch<TenantSearchReindexResult>('/admin/search/reindex', {
    method: 'POST',
    body: JSON.stringify({ scopeType: 'tenant' }),
  });
}

export function getSearchAdminHealth(): Promise<SearchAdminHealthDto> {
  return apiFetch<SearchAdminHealthDto>('/admin/search/health');
}
