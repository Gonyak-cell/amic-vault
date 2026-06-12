'use client';

import React, { useState } from 'react';
import type { AiCitationDto, AiCitationSourceDto } from '@amic-vault/shared';
import { Button } from '../ui/button';
import { safeApiErrorMessage } from '../../lib/api/error-messages';
import { getCitationSources } from '../../lib/api/ai-citations';

interface CitationSourcePanelProps {
  matterId: string;
  citations: readonly AiCitationDto[];
}

export function CitationSourcePanel({ matterId, citations }: CitationSourcePanelProps) {
  const [sources, setSources] = useState<AiCitationSourceDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSources() {
    setBusy(true);
    setError(null);
    try {
      const response = await getCitationSources({ matterId, citations: [...citations] });
      setSources(response.sources);
    } catch (caught) {
      setSources([]);
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-normal">Sources</h2>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={loadSources}>
          {busy ? 'Loading' : 'Sources'}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-muted-foreground">{error}</p> : null}
      {sources.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {sources.map((source) => (
            <li key={source.citationRef} className="min-w-0">
              <p className="truncate font-medium">{source.title}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {source.documentId} · {source.versionStatus}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
