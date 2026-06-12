import { describe, expect, it } from 'vitest';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import { AiContextWindowManager } from './context-window.manager';

const hash = 'b'.repeat(64);

function chunk(index: number, tokenCount: number): AiRetrievedChunk {
  return {
    documentId: '11111111-1111-4111-8111-111111111201',
    versionId: '11111111-1111-4111-8111-111111111301',
    matterId: '11111111-1111-4111-8111-111111111101',
    chunkId: `11111111-1111-4111-8111-1111111114${String(index).padStart(2, '0')}`,
    parentChunkId: null,
    chunkOrdinal: index,
    tokenCount,
    score: 1 - index / 100,
    redactedText: `authorized context ${index}`,
    textHash: hash,
    sourceTextHash: hash,
  };
}

describe('AiContextWindowManager', () => {
  it('keeps the context window within the bounded token budget', () => {
    const manager = new AiContextWindowManager();

    const result = manager.fit([chunk(1, 12), chunk(2, 6), chunk(3, 5)], {
      tokenBudget: 18,
    });

    expect(result.tokenBudget).toBe(18);
    expect(result.tokenCount).toBe(18);
    expect(result.chunks.map((item) => item.chunkId)).toEqual([
      '11111111-1111-4111-8111-111111111401',
      '11111111-1111-4111-8111-111111111402',
    ]);
    expect(result.omittedChunkIds).toEqual(['11111111-1111-4111-8111-111111111403']);
  });

  it('logs omitted chunks by id only when chunks exceed budget or count', () => {
    const manager = new AiContextWindowManager();
    const chunks = Array.from({ length: 14 }, (_, index) => chunk(index + 1, 1));

    const result = manager.fit(chunks, { tokenBudget: 4000, maxChunks: 12 });

    expect(result.chunks).toHaveLength(12);
    expect(result.omittedChunkIds).toEqual([
      '11111111-1111-4111-8111-111111111413',
      '11111111-1111-4111-8111-111111111414',
    ]);
    expect(JSON.stringify(result.omittedChunkIds)).not.toContain('authorized context');
  });
});
