import type { SearchPrivacySettingsDto } from '@amic-vault/shared';
import type { SearchFacetSelection } from '@/components/search/search-facets';

export type SearchUrlSelection = Pick<
  SearchFacetSelection,
  | 'clientId'
  | 'clientName'
  | 'confidentialityLevel'
  | 'dateRange'
  | 'documentType'
  | 'extractionStatus'
  | 'groupBy'
  | 'legalHold'
  | 'matterCode'
  | 'matterId'
  | 'matterName'
  | 'mode'
  | 'ocrConfidence'
  | 'privilegeStatus'
  | 'recordsStatus'
  | 'sortBy'
  | 'target'
  | 'versionStatus'
>;

export function urlForPolicy(
  privacySettings: SearchPrivacySettingsDto,
  query: string,
  selection: SearchUrlSelection,
  page: number,
): string {
  if (!privacySettings.allowPlaintextReusableUrls) return privateSearchUrl();
  return urlForState(query, selection, page);
}

export function urlForState(query: string, selection: SearchUrlSelection, page: number): string {
  const params = new URLSearchParams();
  params.set('q', query);
  if (page > 1) params.set('page', String(page));
  if (selection.matterId) params.set('matterId', selection.matterId);
  if (selection.clientId) params.set('clientId', selection.clientId);
  if (selection.confidentialityLevel) {
    params.set('confidentialityLevel', selection.confidentialityLevel);
  }
  if (selection.documentType) params.set('documentType', selection.documentType);
  if (selection.extractionStatus) params.set('extractionStatus', selection.extractionStatus);
  if (selection.ocrConfidence) params.set('ocrConfidence', selection.ocrConfidence);
  if (selection.legalHold) params.set('legalHold', selection.legalHold);
  if (selection.recordsStatus) params.set('recordsStatus', selection.recordsStatus);
  if (selection.versionStatus) params.set('versionStatus', selection.versionStatus);
  if (selection.dateRange) params.set('dateRange', selection.dateRange);
  if (selection.clientName) params.set('clientName', selection.clientName);
  if (selection.groupBy && selection.groupBy !== 'none') params.set('groupBy', selection.groupBy);
  if (selection.matterCode) params.set('matterCode', selection.matterCode);
  if (selection.matterName) params.set('matterName', selection.matterName);
  if (selection.mode && selection.mode !== 'keyword') params.set('mode', selection.mode);
  if (selection.privilegeStatus) params.set('privilegeStatus', selection.privilegeStatus);
  if (selection.sortBy && selection.sortBy !== 'relevance') params.set('sortBy', selection.sortBy);
  if (selection.target && selection.target !== 'all') params.set('target', selection.target);
  return `/search?${params.toString()}`;
}

export function privateSearchUrl(savedSearchId?: string): string {
  if (!savedSearchId) return '/search';
  const params = new URLSearchParams();
  params.set('searchRef', savedSearchId);
  return `/search?${params.toString()}`;
}
