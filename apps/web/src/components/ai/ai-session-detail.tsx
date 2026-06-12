'use client';

import React from 'react';
import type { AiSessionDetailDto } from '@amic-vault/shared';

export function AiSessionDetail({ session }: { session: AiSessionDetailDto }) {
  return (
    <section aria-label="AI session detail" className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <span className="font-medium text-slate-700">Status</span>
          <div>{session.status}</div>
        </div>
        <div>
          <span className="font-medium text-slate-700">Model</span>
          <div>{session.modelRoute}</div>
        </div>
        <div>
          <span className="font-medium text-slate-700">Prompt hash</span>
          <div className="break-all font-mono text-xs">{session.promptHash}</div>
        </div>
        <div>
          <span className="font-medium text-slate-700">Response hash</span>
          <div className="break-all font-mono text-xs">{session.responseHash ?? 'pending'}</div>
        </div>
      </div>
      <div className="text-sm text-slate-700">
        Sources visible: {session.chunks.length}
        {session.hiddenSourceCount > 0 ? ` / hidden: ${session.hiddenSourceCount}` : ''}
      </div>
      <ul className="space-y-2">
        {session.chunks.map((chunk) => (
          <li key={chunk.chunkId} className="rounded border border-slate-200 p-2 text-xs">
            <div className="font-mono break-all">{chunk.chunkId}</div>
            <div className="text-slate-600">
              {chunk.included ? 'included' : chunk.reasonCode} · rank {chunk.rankIndex ?? '-'}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
