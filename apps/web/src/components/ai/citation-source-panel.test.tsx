import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiCitationDto } from '@amic-vault/shared';
import { CitationSourcePanel } from './citation-source-panel';

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('../../lib/api/ai-citations', () => ({
  getCitationSources: vi.fn(),
}));

const citation: AiCitationDto = {
  citationRef: 'chunk:11111111-1111-4111-8111-111111111004',
  matterId: '11111111-1111-4111-8111-111111111001',
  documentId: '11111111-1111-4111-8111-111111111002',
  versionId: '11111111-1111-4111-8111-111111111003',
  chunkId: '11111111-1111-4111-8111-111111111004',
  quoteHash: 'a'.repeat(64),
  sourceTextHash: 'b'.repeat(64),
};

describe('CitationSourcePanel', () => {
  it('renders source panel shell without citation raw body text', () => {
    const html = renderToStaticMarkup(
      <CitationSourcePanel matterId={citation.matterId} citations={[citation]} />,
    );

    expect(html).toContain('Sources');
    expect(html).not.toContain('raw body');
    expect(html).not.toContain('chunk text');
  });
});
