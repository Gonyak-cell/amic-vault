import type { AiPrepArtifactKind } from '@amic-vault/shared';

export const aiPrepQueueName = 'ai.prep';
export const aiPrepDeadLetterQueueName = 'ai.prep.dead';

export interface AiPrepJobPayload {
  tenantId: string;
  documentId: string;
  versionId: string;
  artifactKind: AiPrepArtifactKind;
  matterId?: string | undefined;
}

export interface AiPrepSourceChunk {
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

export interface AiPrepSource {
  tenantId: string;
  documentId: string;
  versionId: string;
  matterId: string;
  actorId: string;
  title: string;
  chunks: AiPrepSourceChunk[];
}

export type AiPrepFailureReason =
  | 'AI_PREP_TARGET_MISSING'
  | 'AI_PREP_SCOPE_DENIED'
  | 'AI_PREP_POLICY_BLOCKED'
  | 'AI_PREP_NO_SOURCE_CHUNKS'
  | 'AI_PREP_REDACTION_BLOCKED'
  | 'AI_PREP_GENERATION_BLOCKED'
  | 'AI_PREP_VALIDATION_FAILED'
  | 'AI_PREP_RETRY_EXHAUSTED'
  | 'AI_PREP_FAILED';
