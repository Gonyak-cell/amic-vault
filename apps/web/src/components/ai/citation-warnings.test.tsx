import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CitationWarnings } from './citation-warnings';

describe('CitationWarnings', () => {
  it('renders citation warning codes without raw claim text', () => {
    const html = renderToStaticMarkup(
      <CitationWarnings
        warnings={[
          {
            code: 'UNCITED_CLAIM',
            claimId: 'claim-1',
            escalationRequired: false,
          },
          {
            code: 'LEGAL_CONCLUSION_REQUIRES_REVIEW',
            claimId: 'claim-2',
            escalationRequired: true,
          },
        ]}
      />,
    );

    expect(html).toContain('Citation warnings');
    expect(html).toContain('uncited claim');
    expect(html).toContain('legal conclusion requires review');
    expect(html).not.toContain('raw claim');
  });
});
