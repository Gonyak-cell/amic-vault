import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AiRetrievalResult, AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import { AiContextRanker } from './context-ranker';
import { AiContextWindowManager } from './context-window.manager';
import { AiEvidencePackBuilder } from './evidence-pack.builder';

const tenantId = '11111111-1111-4111-8111-111111111001';
const matterId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const sourceHash = 'c'.repeat(64);

function chunk(input: Partial<AiRetrievedChunk>): AiRetrievedChunk {
  return {
    documentId: '11111111-1111-4111-8111-111111111201',
    versionId,
    matterId,
    chunkId: '11111111-1111-4111-8111-111111111301',
    parentChunkId: null,
    chunkOrdinal: 0,
    tokenCount: 10,
    score: 0.9,
    redactedText: 'redacted and authorized context only',
    textHash: sourceHash,
    sourceTextHash: sourceHash,
    ...input,
  };
}

function readyRetrieval(chunks: AiRetrievedChunk[]): AiRetrievalResult {
  return {
    status: 'ready',
    questionKind: 'retrieval',
    chunks,
    omittedChunkIds: [],
    appliedRules: [
      'question.retrieval:supported',
      'matter.membership:required',
      'retrieval.hybrid:query_stage_scope',
    ],
  };
}

describe('AiEvidencePackBuilder', () => {
  it('builds R6 degraded evidence packs from scoped authorized chunks only', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );
    const lowerScoreChunk = chunk({
      documentId: '11111111-1111-4111-8111-111111111203',
      chunkId: '11111111-1111-4111-8111-111111111303',
      score: 0.7,
      redactedText: 'later authorized context',
    });
    const higherScoreChunk = {
      ...chunk({
        documentId: '11111111-1111-4111-8111-111111111202',
        chunkId: '11111111-1111-4111-8111-111111111302',
        score: 0.95,
        redactedText: 'safe context with [REDACTED:email_address]',
      }),
      title: 'privileged title leakage',
      snippet: 'snippet leakage',
      metadata: { secret: 'metadata leakage' },
      chunkText: 'raw lawyer@example.test body leakage',
    };

    const pack = builder.build({
      tenantId,
      matterId,
      userQuestion: '계약 해지 조항을 요약해줘',
      retrieval: readyRetrieval([lowerScoreChunk, higherScoreChunk]),
      tokenBudget: 20,
      taskType: 'summary',
    });

    expect(pack.graphFacts).toEqual([]);
    expect(pack.ruleFindings).toEqual([]);
    expect(pack.retrievedChunks.map((item) => item.chunkId)).toEqual([
      '11111111-1111-4111-8111-111111111302',
      '11111111-1111-4111-8111-111111111303',
    ]);
    expect(pack.citationRequirements.sourceRefs).toEqual([
      'chunk:11111111-1111-4111-8111-111111111302',
      'chunk:11111111-1111-4111-8111-111111111303',
    ]);
    const serialized = JSON.stringify(pack);
    expect(serialized).not.toContain('privileged title leakage');
    expect(serialized).not.toContain('snippet leakage');
    expect(serialized).not.toContain('metadata leakage');
    expect(serialized).not.toContain('lawyer@example.test');
    expect(pack.retrievedChunks[0]?.redactedText).toContain('[REDACTED:email_address]');
  });

  it('fails closed when retrieval was not query-stage permission scoped', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );

    expect(() =>
      builder.build({
        tenantId,
        matterId,
        userQuestion: 'summarize',
        retrieval: {
          ...readyRetrieval([chunk({})]),
          appliedRules: ['question.retrieval:supported'],
        },
      }),
    ).toThrow(ForbiddenException);
  });
});
