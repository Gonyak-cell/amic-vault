import { describe, expect, it } from 'vitest';
import { buildParentChildChunks } from './document-chunker';

describe('document chunker', () => {
  it('creates bounded parent and child chunks with provenance', () => {
    const text = Array.from({ length: 120 }, (_, index) => `clause-${index}`).join(' ');
    const chunks = buildParentChildChunks({
      text,
      sourceTextHash: 'a'.repeat(64),
    });

    expect(chunks[0]).toMatchObject({
      chunkKind: 'parent',
      parentOrdinal: null,
      charStart: 0,
      sourceTextHash: 'a'.repeat(64),
    });
    expect(chunks.some((chunk) => chunk.chunkKind === 'child' && chunk.parentOrdinal === 0)).toBe(
      true,
    );
    for (const chunk of chunks) {
      expect(chunk.charEnd).toBeGreaterThan(chunk.charStart);
      expect(chunk.chunkText.length).toBeLessThanOrEqual(4000);
      expect(chunk.textHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('caps stored token counts to the document_chunks constraint', () => {
    const text = Array.from({ length: 1600 }, (_, index) => `t${index}`).join(' ');
    const chunks = buildParentChildChunks({
      text,
      sourceTextHash: 'b'.repeat(64),
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.tokenCount >= 1 && chunk.tokenCount <= 1200)).toBe(true);
  });
});
