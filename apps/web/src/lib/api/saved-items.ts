'use client';

import type {
  CreateSavedItemDto,
  ReorderSavedItemsDto,
  SavedItemDto,
  SavedItemListDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function listSavedItems(): Promise<SavedItemListDto> {
  return apiFetch<SavedItemListDto>('/saved-items');
}

export function createSavedItem(input: CreateSavedItemDto): Promise<SavedItemDto> {
  return apiFetch<SavedItemDto>('/saved-items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeSavedItem(savedItemId: string): Promise<void> {
  return apiFetch<void>(`/saved-items/${encodeURIComponent(savedItemId)}`, {
    method: 'DELETE',
  });
}

export function reorderSavedItems(input: ReorderSavedItemsDto): Promise<void> {
  return apiFetch<void>('/saved-items/order', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
