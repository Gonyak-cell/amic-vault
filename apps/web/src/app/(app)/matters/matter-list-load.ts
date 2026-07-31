import type { MatterDto } from '@amic-vault/shared';
import { listMatters } from '@/lib/api-client';
import { uiErrorStateForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';

export type MatterLoadState = DataState<MatterDto[]>['status'];

export async function loadMatterList(
  query: Parameters<typeof listMatters>[0],
): Promise<{ matters: MatterDto[]; loadState: MatterLoadState }> {
  try {
    const result = await listMatters(query);
    return {
      matters: result.items,
      loadState: result.items.length === 0 ? 'empty' : 'ready',
    };
  } catch (error: unknown) {
    return { matters: [], loadState: matterLoadStateForError(error) };
  }
}

export function matterLoadStateForError(error: unknown): MatterLoadState {
  const state = uiErrorStateForApiError(error);
  return state.emptyStateVariant === 'api-unavailable' ? 'unavailable' : state.dataStatus;
}
