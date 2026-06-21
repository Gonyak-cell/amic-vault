'use client';

import type {
  CreateSavedSearchDto,
  SavedSearchDto,
  SavedSearchListDto,
  SearchQueryDto,
  SearchResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function searchDocuments(input: SearchQueryDto): Promise<SearchResponseDto> {
  return apiFetch<SearchResponseDto>('/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listSavedSearches(): Promise<SavedSearchListDto> {
  return apiFetch<SavedSearchListDto>('/search/saved-searches');
}

export function saveSavedSearch(input: CreateSavedSearchDto): Promise<SavedSearchDto> {
  return apiFetch<SavedSearchDto>('/search/saved-searches', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function recordSavedSearchOpen(savedSearchId: string): Promise<SavedSearchDto> {
  return apiFetch<SavedSearchDto>(
    `/search/saved-searches/${encodeURIComponent(savedSearchId)}/open`,
    {
      method: 'POST',
    },
  );
}

export function deleteSavedSearch(savedSearchId: string): Promise<void> {
  return apiFetch<void>(`/search/saved-searches/${encodeURIComponent(savedSearchId)}`, {
    method: 'DELETE',
  });
}
