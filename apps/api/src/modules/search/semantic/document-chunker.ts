import { createHash } from 'node:crypto';
import type { AiChunkKind } from '@amic-vault/shared';

const parentMaxChars = 3200;
const childMaxChars = 900;
const childOverlapChars = 120;
const maxChunksPerVersion = 256;
const maxStoredTokenCount = 1200;

export interface BuiltDocumentChunk {
  chunkKind: AiChunkKind;
  chunkOrdinal: number;
  parentOrdinal: number | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  chunkText: string;
  textHash: string;
  sourceTextHash: string;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function tokenCount(text: string): number {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return Math.min(maxStoredTokenCount, Math.max(1, tokens.length));
}

function boundedEnd(text: string, start: number, targetEnd: number): number {
  const capped = Math.min(text.length, targetEnd);
  if (capped >= text.length) return text.length;
  const nextSpace = text.indexOf(' ', capped);
  if (nextSpace > start && nextSpace - start <= targetEnd - start + 80) {
    return nextSpace;
  }
  return capped;
}

function pushChunk(
  chunks: BuiltDocumentChunk[],
  input: {
    kind: AiChunkKind;
    parentOrdinal: number | null;
    text: string;
    start: number;
    end: number;
    sourceTextHash: string;
  },
): number {
  const chunkText = input.text.slice(input.start, input.end).trim();
  if (!chunkText) return -1;
  const ordinal = chunks.length;
  chunks.push({
    chunkKind: input.kind,
    chunkOrdinal: ordinal,
    parentOrdinal: input.parentOrdinal,
    charStart: input.start,
    charEnd: input.end,
    tokenCount: tokenCount(chunkText),
    chunkText,
    textHash: sha256Hex(chunkText),
    sourceTextHash: input.sourceTextHash,
  });
  return ordinal;
}

export function buildParentChildChunks(input: {
  text: string;
  sourceTextHash: string;
}): BuiltDocumentChunk[] {
  const text = input.text;
  if (!text.trim()) return [];

  const chunks: BuiltDocumentChunk[] = [];
  let parentStart = 0;
  while (parentStart < text.length && chunks.length < maxChunksPerVersion) {
    const parentEnd = boundedEnd(text, parentStart, parentStart + parentMaxChars);
    const parentOrdinal = pushChunk(chunks, {
      kind: 'parent',
      parentOrdinal: null,
      text,
      start: parentStart,
      end: parentEnd,
      sourceTextHash: input.sourceTextHash,
    });
    if (parentOrdinal >= 0) {
      let childStart = parentStart;
      while (childStart < parentEnd && chunks.length < maxChunksPerVersion) {
        const childEnd = boundedEnd(text, childStart, childStart + childMaxChars);
        pushChunk(chunks, {
          kind: 'child',
          parentOrdinal,
          text,
          start: childStart,
          end: childEnd,
          sourceTextHash: input.sourceTextHash,
        });
        if (childEnd >= parentEnd) break;
        childStart = Math.max(childStart + 1, childEnd - childOverlapChars);
      }
    }
    if (parentEnd >= text.length) break;
    parentStart = parentEnd;
  }

  return chunks;
}
