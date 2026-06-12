'use client';

import type { SearchQueryDto, SearchResponseDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function searchDocuments(input: SearchQueryDto): Promise<SearchResponseDto> {
  return apiFetch<SearchResponseDto>('/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
