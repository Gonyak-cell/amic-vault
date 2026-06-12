import { Injectable } from '@nestjs/common';
import type { AiRetrievalCandidate } from './ai-retrieval.types';

@Injectable()
export class AiDeterministicReranker {
  rerank(candidates: readonly AiRetrievalCandidate[]): AiRetrievalCandidate[] {
    return [...candidates].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.documentId !== right.documentId) return left.documentId.localeCompare(right.documentId);
      if (left.versionId !== right.versionId) return left.versionId.localeCompare(right.versionId);
      return left.chunkOrdinal - right.chunkOrdinal;
    });
  }
}
