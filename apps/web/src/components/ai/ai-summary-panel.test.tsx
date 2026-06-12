import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiSummaryResponseDto } from '@amic-vault/shared';
import { AiSummaryPanel } from './ai-summary-panel';

describe('AiSummaryPanel', () => {
  it('renders cited summary sections without hidden source fields', () => {
    const html = renderToStaticMarkup(<AiSummaryPanel summary={summary()} />);

    expect(html).toContain('matter_summary');
    expect(html).toContain('Authorized matter evidence');
    expect(html).toContain('chunk:11111111-1111-4111-8111-111111111114');
    expect(html).not.toContain('hidden unauthorized');
  });
});

function summary(): AiSummaryResponseDto {
  const matterId = '11111111-1111-4111-8111-111111111111';
  const documentId = '11111111-1111-4111-8111-111111111112';
  const versionId = '11111111-1111-4111-8111-111111111113';
  const chunkId = '11111111-1111-4111-8111-111111111114';
  const hash = 'a'.repeat(64);
  return {
    sessionId: '11111111-1111-4111-8111-111111111115',
    matterId,
    task: 'matter_summary',
    status: 'completed',
    modelRoute: 'local_gemma',
    evidencePackId: '11111111-1111-4111-8111-111111111116',
    citations: [
      {
        citationRef: `chunk:${chunkId}`,
        matterId,
        documentId,
        versionId,
        chunkId,
        quoteHash: hash,
        sourceTextHash: hash,
      },
    ],
    claims: [
      {
        claimId: 'matter_summary-1',
        claimHash: hash,
        citationRefs: [`chunk:${chunkId}`],
      },
    ],
    sections: [
      {
        sectionId: 'matter_summary-1',
        heading: 'Authorized matter evidence',
        text: 'Evidence-only text.',
        citationRefs: [`chunk:${chunkId}`],
      },
    ],
    warnings: ['EVIDENCE_ONLY_DEGRADED'],
    citationWarnings: [],
    escalationRequired: false,
    legalConclusionAutoApproval: false,
  };
}
