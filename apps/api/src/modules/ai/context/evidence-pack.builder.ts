import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  evidencePackSchema,
  type EvidencePackDto,
  type EvidencePackTaskType,
} from '@amic-vault/shared';
import type { AiRetrievalResult, AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import { AiContextRanker } from './context-ranker';
import { AiContextWindowManager } from './context-window.manager';

export interface AiEvidencePackBuildInput {
  tenantId: string;
  matterId: string;
  userQuestion: string;
  retrieval: AiRetrievalResult;
  rewrittenQueries?: readonly string[] | undefined;
  taskType?: EvidencePackTaskType | undefined;
  tokenBudget?: number | undefined;
  locale?: 'ko-KR' | 'en-US' | undefined;
}

@Injectable()
export class AiEvidencePackBuilder {
  constructor(
    @Inject(AiContextRanker) private readonly ranker: AiContextRanker,
    @Inject(AiContextWindowManager) private readonly windowManager: AiContextWindowManager,
  ) {}

  build(input: AiEvidencePackBuildInput): EvidencePackDto {
    this.assertScopedReadyRetrieval(input.retrieval);
    const rankedChunks = this.ranker.rankAuthorizedChunks(input.retrieval.chunks);
    const window = this.windowManager.fit(rankedChunks, {
      tokenBudget: input.tokenBudget,
      maxChunks: 12,
    });
    const retrievedChunks = window.chunks.map((chunk) => toEvidenceChunk(chunk));
    const sourceRefs = retrievedChunks.map((chunk) => chunk.citationRef);
    const pack = {
      packId: randomUUID(),
      userQuestion: input.userQuestion,
      rewrittenQueries: normalizeQueries(input.userQuestion, input.rewrittenQueries),
      taskType: input.taskType ?? 'retrieval',
      matterContext: { matterId: input.matterId },
      retrievalScope: {
        tenantId: input.tenantId,
        matterId: input.matterId,
        mode: 'hybrid',
        modelRoute: 'local_gemma',
        appliedRules: [...input.retrieval.appliedRules],
      },
      relevantDocuments: summarizeDocuments(window.chunks),
      authoritativeSources: [],
      retrievedChunks,
      omittedChunkIds: [...new Set([...input.retrieval.omittedChunkIds, ...window.omittedChunkIds])],
      window: {
        tokenBudget: window.tokenBudget,
        tokenCount: window.tokenCount,
      },
      graphFacts: [],
      ruleFindings: [],
      conflicts: [],
      uncertainty:
        window.omittedChunkIds.length > 0
          ? ['Context window omitted chunks by id only.']
          : [],
      prohibitedAssumptions: [
        'Do not use facts outside retrieved chunks.',
        'Do not cite graph_facts before R7.',
        'Do not cite rule_findings before R8.',
      ],
      citationRequirements: {
        required: true,
        style: 'chunk_ref',
        sourceRefs,
      },
      outputFormat: {
        kind: input.taskType ?? 'retrieval',
        locale: input.locale ?? 'ko-KR',
      },
      escalationFlags: [],
    };

    return evidencePackSchema.parse(pack);
  }

  private assertScopedReadyRetrieval(retrieval: AiRetrievalResult): void {
    if (
      retrieval.status !== 'ready' ||
      !retrieval.appliedRules.includes('retrieval.hybrid:query_stage_scope')
    ) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }
}

function toEvidenceChunk(chunk: AiRetrievedChunk): EvidencePackDto['retrievedChunks'][number] {
  return {
    citationRef: `chunk:${chunk.chunkId}`,
    documentId: chunk.documentId,
    versionId: chunk.versionId,
    matterId: chunk.matterId,
    chunkId: chunk.chunkId,
    parentChunkId: chunk.parentChunkId,
    chunkOrdinal: chunk.chunkOrdinal,
    tokenCount: chunk.tokenCount,
    score: chunk.score,
    redactedText: chunk.redactedText,
    textHash: chunk.textHash,
    sourceTextHash: chunk.sourceTextHash,
  };
}

function normalizeQueries(
  userQuestion: string,
  rewrittenQueries: readonly string[] | undefined,
): string[] {
  const candidates = rewrittenQueries?.length ? rewrittenQueries : [userQuestion];
  return [...new Set(candidates.map((query) => query.trim()).filter(Boolean))].slice(0, 8);
}

function summarizeDocuments(
  chunks: readonly AiRetrievedChunk[],
): EvidencePackDto['relevantDocuments'] {
  const summaries = new Map<
    string,
    {
      documentId: string;
      versionIds: Set<string>;
      chunkCount: number;
      sourceTextHashes: Set<string>;
    }
  >();

  for (const chunk of chunks) {
    const existing =
      summaries.get(chunk.documentId) ??
      {
        documentId: chunk.documentId,
        versionIds: new Set<string>(),
        chunkCount: 0,
        sourceTextHashes: new Set<string>(),
      };
    existing.versionIds.add(chunk.versionId);
    existing.chunkCount += 1;
    existing.sourceTextHashes.add(chunk.sourceTextHash);
    summaries.set(chunk.documentId, existing);
  }

  return [...summaries.values()].map((summary) => ({
    documentId: summary.documentId,
    versionIds: [...summary.versionIds].slice(0, 20),
    chunkCount: summary.chunkCount,
    sourceTextHashes: [...summary.sourceTextHashes].slice(0, 20),
  }));
}
