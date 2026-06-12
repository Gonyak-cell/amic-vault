import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiFeedbackPanel } from './ai-feedback-panel';

describe('AiFeedbackPanel', () => {
  it('renders rating controls and aggregate metrics without text entry fields', () => {
    const html = renderToStaticMarkup(
      <AiFeedbackPanel
        sessionId="11111111-1111-4111-8111-111111111111"
        feedback={{
          feedbackId: '11111111-1111-4111-8111-111111111122',
          sessionId: '11111111-1111-4111-8111-111111111111',
          matterId: '11111111-1111-4111-8111-111111111133',
          recordedByUserId: '11111111-1111-4111-8111-111111111144',
          rating: 4,
          helpful: true,
          correctionType: 'minor_edit',
          errorTypes: ['incorrect_citation'],
          editDistance: 9,
          createdAt: '2026-06-12T00:00:00.000Z',
        }}
        metrics={{
          tenantId: '11111111-1111-4111-8111-111111111111',
          matterId: null,
          feedbackCount: 3,
          averageRating: 4.2,
          helpfulRate: 1,
          correctionRate: 0.33,
          hallucinationReportRate: 0,
          permissionConcernCount: 0,
          stopCriteria: [],
        }}
      />,
    );

    expect(html).toContain('Rate AI result 5');
    expect(html).toContain('Recorded rating 4');
    expect(html).toContain('Correction rate');
    expect(html).not.toMatch(/textarea|comment|body|content|snippet|raw|prompt|response/i);
  });
});
