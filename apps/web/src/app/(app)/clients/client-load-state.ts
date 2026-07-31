import type { ClientDto, ClientListDto, ListClientsQueryDto } from '@amic-vault/shared';
import { ApiClientError, listClients } from '@/lib/api-client';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';

export type ClientResourceLoadState = Extract<
  DataState<unknown>['status'],
  'loading' | 'ready' | 'empty' | 'unavailable' | 'error' | 'forbidden' | 'blocked'
>;

export type ClientResourceErrorState = Exclude<
  ClientResourceLoadState,
  'loading' | 'ready' | 'empty'
>;

export function clientResourceLoadStateForApiError(error: unknown): ClientResourceErrorState {
  return error instanceof ApiClientError ? dataStateStatusForApiError(error) : 'unavailable';
}

export type ClientListLoadUpdate =
  | {
      loadState: 'ready' | 'empty';
      clients: ClientDto[];
      listMeta: Pick<ClientListDto, 'totalCount' | 'page' | 'pageSize'>;
    }
  | {
      loadState: ClientResourceErrorState;
      clients: [];
      listMeta: null;
    };

export type ClientListLoadRequest = (query: Partial<ListClientsQueryDto>) => Promise<ClientListDto>;

export type ClientListRequestRef = {
  current: (() => void) | null;
};

export function cancelPendingClientListRequest(requestRef: ClientListRequestRef): void {
  requestRef.current?.();
  requestRef.current = null;
}

/**
 * Starts one client-list request and returns an invalidator for its generation.
 * Only the current generation can publish either a success or an error update.
 */
export function loadClientList(
  query: Partial<ListClientsQueryDto>,
  onUpdate: (update: ClientListLoadUpdate) => void,
  request: ClientListLoadRequest = listClients,
): () => void {
  let generation = 0;
  const requestGeneration = ++generation;
  const isCurrent = () => requestGeneration === generation;

  request(query).then(
    (result) => {
      if (!isCurrent()) return;
      onUpdate({
        clients: result.items,
        listMeta: {
          page: result.page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
        },
        loadState: result.totalCount === 0 && result.items.length === 0 ? 'empty' : 'ready',
      });
    },
    (error: unknown) => {
      if (!isCurrent()) return;
      onUpdate({
        clients: [],
        listMeta: null,
        loadState: clientResourceLoadStateForApiError(error),
      });
    },
  );

  return () => {
    generation += 1;
  };
}
