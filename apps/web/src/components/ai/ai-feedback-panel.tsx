'use client';

import React from 'react';
import type { AiFeedbackMetricsDto, AiFeedbackResponseDto } from '@amic-vault/shared';

export function AiFeedbackPanel({
  sessionId,
  feedback,
  metrics,
}: {
  sessionId: string;
  feedback?: AiFeedbackResponseDto | null;
  metrics?: AiFeedbackMetricsDto | null;
}) {
  return (
    <section aria-label="AI feedback" className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            aria-label={`Rate AI result ${rating}`}
            data-session-id={sessionId}
            className="rounded border border-slate-200 px-2 py-1 text-center hover:bg-slate-50"
          >
            {rating}
          </button>
        ))}
      </div>
      {feedback ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
          Recorded rating {feedback.rating}
        </div>
      ) : null}
      {metrics ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-700">Feedback</dt>
            <dd>{metrics.feedbackCount}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Average</dt>
            <dd>{metrics.averageRating?.toFixed(1) ?? '-'}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Correction rate</dt>
            <dd>{Math.round(metrics.correctionRate * 100)}%</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
