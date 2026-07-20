import { createHash } from 'node:crypto';
import { aiEmbeddingDimension } from '@amic-vault/shared';

const tokenPattern = /[\p{L}\p{N}_]+/gu;

export function deterministicEmbeddingVector(text: string): number[] {
  const vector = Array.from({ length: aiEmbeddingDimension }, () => 0);
  const tokens = text.toLowerCase().match(tokenPattern) ?? [];
  const source = tokens.length > 0 ? tokens : [text.slice(0, 256)];

  for (const token of source) {
    for (let index = 0; index < aiEmbeddingDimension; index += 1) {
      const digest = createHash('sha256').update(`${token}:${index}`).digest();
      const byte = digest[0] ?? 0;
      const sign = (digest[1] ?? 0) % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign * (byte / 255);
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function zeroEmbeddingVector(): number[] {
  return Array.from({ length: aiEmbeddingDimension }, () => 0);
}

export function vectorToSqlLiteral(
  vector: readonly number[],
  expectedDimension = aiEmbeddingDimension,
): string {
  if (vector.length !== expectedDimension) {
    throw new Error(`embedding vector must have ${expectedDimension} dimensions`);
  }
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}

export function embeddingHash(vector: readonly number[]): string {
  return createHash('sha256').update(vectorToSqlLiteral(vector)).digest('hex');
}
