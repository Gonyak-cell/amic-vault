import type { ClientDto, ListMattersQueryDto, MatterDto, MatterListDto } from '@amic-vault/shared';
import {
  clientResourceLoadStateForApiError,
  type ClientResourceErrorState,
} from '../client-load-state';

export interface ClientDetailLoaders {
  getClient: (clientId: string) => Promise<ClientDto>;
  listMatters: (query: Partial<ListMattersQueryDto>) => Promise<MatterListDto>;
}

export type ClientDetailSectionUpdate =
  | {
      section: 'client';
      loadState: 'ready';
      client: ClientDto;
    }
  | {
      section: 'client';
      loadState: ClientResourceErrorState;
      client: null;
    }
  | {
      section: 'portfolio';
      loadState: 'ready' | 'empty';
      matters: MatterDto[];
      matterPage: number;
      matterTotalCount: number;
    }
  | {
      section: 'portfolio';
      loadState: ClientResourceErrorState;
      matters: [];
      matterPage: undefined;
      matterTotalCount: undefined;
    };

export function loadClientDetailSections(
  clientId: string,
  loaders: ClientDetailLoaders,
  onUpdate: (update: ClientDetailSectionUpdate) => void,
): () => void {
  let cancelled = false;
  const publish = (update: ClientDetailSectionUpdate) => {
    if (!cancelled) onUpdate(update);
  };

  loaders.getClient(clientId).then(
    (client) => publish({ client, loadState: 'ready', section: 'client' }),
    (error: unknown) =>
      publish({
        client: null,
        loadState: clientErrorState(error),
        section: 'client',
      }),
  );

  loaders.listMatters({ clientId, pageSize: 100 }).then(
    (result) =>
      publish({
        loadState: result.totalCount === 0 && result.items.length === 0 ? 'empty' : 'ready',
        matterPage: result.page,
        matterTotalCount: result.totalCount,
        matters: result.items,
        section: 'portfolio',
      }),
    (error: unknown) =>
      publish({
        loadState: clientErrorState(error),
        matterPage: undefined,
        matterTotalCount: undefined,
        matters: [],
        section: 'portfolio',
      }),
  );

  return () => {
    cancelled = true;
  };
}

function clientErrorState(error: unknown): ClientResourceErrorState {
  return clientResourceLoadStateForApiError(error);
}
