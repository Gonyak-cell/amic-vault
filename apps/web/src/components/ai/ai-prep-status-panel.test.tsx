import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiPrepDocumentStatusDto } from '@amic-vault/shared';
import { AiPrepStatusPanel } from './ai-prep-status-panel';

describe('AiPrepStatusPanel', () => {
  it('renders authorized prep output with citation refs and no raw hidden fields', () => {
    const html = renderToStaticMarkup(<AiPrepStatusPanel status={status()} />);

    expect(html).toContain('AI 준비');
    expect(html).toContain('document_brief');
    expect(html).toContain('Grounded answer.');
    expect(html).toContain('chunk:11111111-1111-4111-8111-111111111118');
    expect(html).toContain('document_brief 유용함 표시');
    expect(html).toContain('준비 완료');
    expect(html).toContain('출처 1개');
    expect(html).not.toMatch(/prompt|raw source|model response|hidden unauthorized/i);
  });
});

function status(): AiPrepDocumentStatusDto {
  const chunkId = '11111111-1111-4111-8111-111111111118';
  return {
    documentId: '11111111-1111-4111-8111-111111111114',
    versionId: '11111111-1111-4111-8111-111111111115',
    readinessStatus: 'ready',
    artifacts: [
      {
        artifactId: '11111111-1111-4111-8111-111111111116',
        artifactKind: 'document_brief',
        status: 'completed',
        isStale: false,
        sourceChunkCount: 1,
        generatedAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
        payload: {
          answer: 'authorized prep',
          sections: [
            {
              section_id: 'brief',
              heading: 'Brief',
              text: 'Grounded answer.',
              source_refs: [`chunk:${chunkId}`],
            },
          ],
          claims: [
            {
              claim_id: 'claim-1',
              kind: 'summary',
              text: 'Grounded answer.',
              source_refs: [`chunk:${chunkId}`],
              is_legal_conclusion: false,
            },
          ],
          source_refs: [`chunk:${chunkId}`],
        },
      },
    ],
  };
}
