import { createHash } from 'node:crypto';
import { aiEmbeddingDimension } from '@amic-vault/shared';

const tokenPattern = /[\p{L}\p{N}_]+/gu;

export function deterministicEmbeddingVector(text: string): number[] {
  const vector = Array.from({ length: aiEmbeddingDimension }, () => 0);
  const tokens = text.toLowerCase().match(tokenPattern) ?? [];
  const source = tokens.length > 0 ? tokens : [text.slice(0, 256)];

  for (const token of source) {
    const digest = createHash('sha256').update(token).digest();
    for (let index = 0; index < aiEmbeddingDimension; index += 1) {
      const byte = digest[index] ?? 0;
      const sign = (digest[index + aiEmbeddingDimension] ?? 0) % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign * (byte / 255);
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function vectorToSqlLiteral(vector: readonly number[]): string {
  if (vector.length !== aiEmbeddingDimension) {
    throw new Error(`embedding vector must have ${aiEmbeddingDimension} dimensions`);
  }
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}

export function embeddingHash(vector: readonly number[]): string {
  return createHash('sha256').update(vectorToSqlLiteral(vector)).digest('hex');
}
