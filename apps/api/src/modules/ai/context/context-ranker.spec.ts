import { describe, expect, it } from 'vitest';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import { AiContextRanker } from './context-ranker';

const hash = 'a'.repeat(64);

function chunk(input: Partial<AiRetrievedChunk>): AiRetrievedChunk {
  return {
    documentId: '11111111-1111-4111-8111-111111111201',
    versionId: '11111111-1111-4111-8111-111111111301',
    matterId: '11111111-1111-4111-8111-111111111101',
    chunkId: '11111111-1111-4111-8111-111111111401',
    parentChunkId: null,
    chunkOrdinal: 0,
    tokenCount: 8,
    score: 0.5,
    redactedText: 'authorized context',
    textHash: hash,
    sourceTextHash: hash,
    ...input,
  };
}

describe('AiContextRanker', () => {
  it('ranks authorized chunks with a stable deterministic tie break', () => {
    const ranker = new AiContextRanker();

    const result = ranker.rankAuthorizedChunks([
      chunk({
        documentId: '11111111-1111-4111-8111-111111111203',
        chunkId: '11111111-1111-4111-8111-111111111403',
        score: 0.8,
      }),
      chunk({
        documentId: '11111111-1111-4111-8111-111111111202',
        versionId: '11111111-1111-4111-8111-111111111302',
        chunkId: '11111111-1111-4111-8111-111111111402',
        chunkOrdinal: 3,
        score: 0.8,
      }),
      chunk({
        documentId: '11111111-1111-4111-8111-111111111202',
        versionId: '11111111-1111-4111-8111-111111111302',
        chunkId: '11111111-1111-4111-8111-111111111405',
        chunkOrdinal: 1,
        score: 0.8,
      }),
      chunk({
        documentId: '11111111-1111-4111-8111-111111111204',
        chunkId: '11111111-1111-4111-8111-111111111404',
        score: 0.7,
      }),
    ]);

    expect(result.map((item) => item.chunkId)).toEqual([
      '11111111-1111-4111-8111-111111111405',
      '11111111-1111-4111-8111-111111111402',
      '11111111-1111-4111-8111-111111111403',
      '11111111-1111-4111-8111-111111111404',
    ]);
  });
});
