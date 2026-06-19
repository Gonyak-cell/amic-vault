'use client';

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
