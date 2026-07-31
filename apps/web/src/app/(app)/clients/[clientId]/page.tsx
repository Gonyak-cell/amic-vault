'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientDto, MatterDto } from '@amic-vault/shared';
import { getClient, listMatters } from '@/lib/api-client';
import {
  ClientDetailView,
  type ClientDetailLoadState,
  type ClientPortfolioLoadState,
} from './client-detail-view';
import { loadClientDetailSections, type ClientDetailSectionUpdate } from './client-detail-load';

export default function ClientDetailPage({ params }: { params: { clientId: string } }) {
  const clientId = params.clientId;
  const [client, setClient] = useState<ClientDto | null>(null);
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [matterTotalCount, setMatterTotalCount] = useState<number | undefined>(undefined);
  const [matterPage, setMatterPage] = useState<number | undefined>(undefined);
  const [clientLoadState, setClientLoadState] = useState<ClientDetailLoadState>('loading');
  const [matterLoadState, setMatterLoadState] = useState<ClientPortfolioLoadState>('loading');
  const cancelRequestRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(() => {
    cancelRequestRef.current?.();
    setClientLoadState('loading');
    setMatterLoadState('loading');

    cancelRequestRef.current = loadClientDetailSections(
      clientId,
      { getClient, listMatters },
      (update: ClientDetailSectionUpdate) => {
        if (update.section === 'client') {
          setClient(update.client);
          setClientLoadState(update.loadState);
          return;
        }

        setMatters(update.matters);
        setMatterTotalCount(update.matterTotalCount);
        setMatterPage(update.matterPage);
        setMatterLoadState(update.loadState);
      },
    );
  }, [clientId]);

  useEffect(() => {
    refresh();
    return () => cancelRequestRef.current?.();
  }, [refresh]);

  return (
    <ClientDetailView
      clientId={clientId}
      client={client}
      loadState={clientLoadState}
      matterLoadState={matterLoadState}
      matters={matters}
      matterPage={matterPage}
      matterTotalCount={matterTotalCount}
      onRefresh={refresh}
    />
  );
}
