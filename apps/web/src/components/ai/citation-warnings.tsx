'use client';

import React from 'react';
import type { AiCitationVerificationWarningDto } from '@amic-vault/shared';

interface CitationWarningsProps {
  warnings: readonly AiCitationVerificationWarningDto[];
}

export function CitationWarnings({ warnings }: CitationWarningsProps) {
  if (warnings.length === 0) return null;
  return (
    <section className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <h2 className="text-sm font-semibold tracking-normal text-destructive">Citation warnings</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        {warnings.map((warning, index) => (
          <li key={`${warning.claimId}-${warning.code}-${index}`} className="break-words">
            <span className="font-mono text-xs">{warning.claimId}</span>
            <span> · {labelForWarning(warning)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function labelForWarning(warning: AiCitationVerificationWarningDto): string {
  if (warning.code === 'UNCITED_CLAIM') return 'uncited claim';
  if (warning.code === 'UNKNOWN_CITATION') return 'unknown citation';
  return 'legal conclusion requires review';
}
