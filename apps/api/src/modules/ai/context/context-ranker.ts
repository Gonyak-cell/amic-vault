import { Injectable } from '@nestjs/common';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';

@Injectable()
export class AiContextRanker {
  rankAuthorizedChunks(chunks: readonly AiRetrievedChunk[]): AiRetrievedChunk[] {
    return [...chunks].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.documentId !== right.documentId) return left.documentId.localeCompare(right.documentId);
      if (left.versionId !== right.versionId) return left.versionId.localeCompare(right.versionId);
      if (left.chunkOrdinal !== right.chunkOrdinal) return left.chunkOrdinal - right.chunkOrdinal;
      return left.chunkId.localeCompare(right.chunkId);
    });
  }
}
