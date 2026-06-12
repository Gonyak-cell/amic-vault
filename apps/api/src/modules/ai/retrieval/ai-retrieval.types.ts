import type { SearchFiltersDto } from '@amic-vault/shared';

export type AiRetrievalStatus = 'ready' | 'unsupported' | 'denied';
export type AiQuestionKind = 'retrieval' | 'unsupported_graph' | 'unsupported_rule';
export type AiRetrievalDeniedReason =
  | 'permission_denied'
  | 'invalid_metadata_filter'
  | 'metadata_matter_mismatch'
  | 'ai_policy_blocked'
  | 'dlp_redaction_failed'
  | 'retrieval_failed';

export interface AiRetrievalRequest {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
  matterId: string;
  query: string;
  filters?: SearchFiltersDto | undefined;
  maxChunks?: number | undefined;
  modelRoute?: string | undefined;
}

export interface AiRetrievedChunk {
  documentId: string;
  versionId: string;
  matterId: string;
  chunkId: string;
  parentChunkId: string | null;
  chunkOrdinal: number;
  tokenCount: number;
  score: number;
  redactedText: string;
  textHash: string;
  sourceTextHash: string;
}

export interface AiRetrievalResult {
  status: AiRetrievalStatus;
  questionKind: AiQuestionKind;
  reasonCode?: AiRetrievalDeniedReason | undefined;
  chunks: AiRetrievedChunk[];
  omittedChunkIds: string[];
  appliedRules: readonly string[];
}

export interface AiRetrievalCandidate {
  documentId: string;
  versionId: string;
  matterId: string;
  chunkId: string;
  parentChunkId: string | null;
  chunkOrdinal: number;
  tokenCount: number;
  score: number;
  chunkText: string;
  textHash: string;
  sourceTextHash: string;
}
