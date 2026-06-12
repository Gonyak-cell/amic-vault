'use client';

import React from 'react';
import type { AiSummaryResponseDto } from '@amic-vault/shared';

export function AiSummaryPanel({ summary }: { summary: AiSummaryResponseDto }) {
  return (
    <section aria-label="AI summary" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded border border-slate-200 px-2 py-1 font-medium">
          {summary.task}
        </span>
        <span className="rounded border border-slate-200 px-2 py-1">{summary.status}</span>
        {summary.escalationRequired ? (
          <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
            review required
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        {summary.sections.map((section) => (
          <article key={section.sectionId} className="rounded border border-slate-200 p-3">
            <h3 className="text-sm font-semibold tracking-normal">{section.heading}</h3>
            <p className="mt-1 text-sm text-slate-700">{section.text}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {section.citationRefs.map((ref) => (
                <span key={ref} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">
                  {ref}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      {summary.warnings.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-600">
          {summary.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
