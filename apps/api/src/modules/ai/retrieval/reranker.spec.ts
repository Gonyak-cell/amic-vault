import { describe, expect, it } from 'vitest';
import { AiDeterministicReranker } from './reranker';
import type { AiRetrievalCandidate } from './ai-retrieval.types';

function candidate(input: {
  documentId: string;
  versionId: string;
  chunkOrdinal: number;
  score: number;
}): AiRetrievalCandidate {
  return {
    documentId: input.documentId,
    versionId: input.versionId,
    matterId: '11111111-1111-4111-8111-111111111103',
    chunkId: `11111111-1111-4111-8111-11111111110${input.chunkOrdinal}`,
    parentChunkId: null,
    chunkOrdinal: input.chunkOrdinal,
    tokenCount: 10,
    score: input.score,
    chunkText: 'retrieved context',
    textHash: 'text-hash',
    sourceTextHash: 'source-hash',
  };
}

describe('AiDeterministicReranker', () => {
  it('orders by score, then stable document/version/chunk identifiers', () => {
    const reranker = new AiDeterministicReranker();
    const result = reranker.rerank([
      candidate({
        documentId: '22222222-2222-4222-8222-222222222222',
        versionId: '11111111-1111-4111-8111-111111111111',
        chunkOrdinal: 2,
        score: 0.5,
      }),
      candidate({
        documentId: '11111111-1111-4111-8111-111111111111',
        versionId: '33333333-3333-4333-8333-333333333333',
        chunkOrdinal: 3,
        score: 0.8,
      }),
      candidate({
        documentId: '11111111-1111-4111-8111-111111111111',
        versionId: '11111111-1111-4111-8111-111111111111',
        chunkOrdinal: 1,
        score: 0.8,
      }),
    ]);

    expect(result.map((item) => item.chunkOrdinal)).toEqual([1, 3, 2]);
  });
});
