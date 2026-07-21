'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ClientDto, MatterDto } from '@amic-vault/shared';
import { getClient, listMatters } from '@/lib/api-client';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import { ClientDetailView, type ClientDetailLoadState } from './client-detail-view';

export default function ClientDetailPage({ params }: { params: { clientId: string } }) {
  const clientId = params.clientId;
  const [client, setClient] = useState<ClientDto | null>(null);
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [loadState, setLoadState] = useState<ClientDetailLoadState>('loading');

  const refresh = useCallback(() => {
    setLoadState('loading');
    Promise.all([getClient(clientId), listMatters({ clientId, pageSize: 100 })])
      .then(([clientResult, matterResult]) => {
        setClient(clientResult);
        setMatters(matterResult.items);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        setClient(null);
        setMatters([]);
        setLoadState(dataStateStatusForApiError(error));
      });
  }, [clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ClientDetailView client={client} loadState={loadState} matters={matters} onRefresh={refresh} />
  );
}
