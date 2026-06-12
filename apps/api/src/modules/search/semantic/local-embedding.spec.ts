import { describe, expect, it } from 'vitest';
import { aiEmbeddingDimension } from '@amic-vault/shared';
import { deterministicEmbeddingVector, embeddingHash, vectorToSqlLiteral } from './local-embedding';

describe('deterministic local embedding', () => {
  it('builds stable bounded pgvector literals without outside model calls', () => {
    const first = deterministicEmbeddingVector('governing law termination covenant');
    const second = deterministicEmbeddingVector('governing law termination covenant');

    expect(first).toEqual(second);
    expect(first).toHaveLength(aiEmbeddingDimension);
    expect(vectorToSqlLiteral(first)).toMatch(/^\[-?\d+\.\d{6}/);
    expect(embeddingHash(first)).toMatch(/^[0-9a-f]{64}$/);
  });
});
