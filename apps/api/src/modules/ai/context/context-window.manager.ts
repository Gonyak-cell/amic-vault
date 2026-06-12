import { Injectable } from '@nestjs/common';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';

export interface AiContextWindowOptions {
  tokenBudget?: number | undefined;
  maxChunks?: number | undefined;
}

export interface AiContextWindowResult {
  chunks: AiRetrievedChunk[];
  omittedChunkIds: string[];
  tokenBudget: number;
  tokenCount: number;
}

const defaultTokenBudget = 1800;
const maxTokenBudget = 4000;
const defaultMaxChunks = 12;

@Injectable()
export class AiContextWindowManager {
  fit(
    rankedChunks: readonly AiRetrievedChunk[],
    options: AiContextWindowOptions = {},
  ): AiContextWindowResult {
    const tokenBudget = boundInteger(options.tokenBudget ?? defaultTokenBudget, 1, maxTokenBudget);
    const maxChunks = boundInteger(options.maxChunks ?? defaultMaxChunks, 1, defaultMaxChunks);
    const chunks: AiRetrievedChunk[] = [];
    const omittedChunkIds: string[] = [];
    let tokenCount = 0;

    for (const chunk of rankedChunks) {
      const nextTokenCount = tokenCount + chunk.tokenCount;
      if (chunks.length >= maxChunks || nextTokenCount > tokenBudget) {
        omittedChunkIds.push(chunk.chunkId);
        continue;
      }
      chunks.push(chunk);
      tokenCount = nextTokenCount;
    }

    return { chunks, omittedChunkIds, tokenBudget, tokenCount };
  }
}

function boundInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
