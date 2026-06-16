import type { AiPrepArtifactKind } from '@amic-vault/shared';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';

export interface AiPrepRetrievalPlan {
  artifactKind: AiPrepArtifactKind;
  tokenBudget: number;
  maxChunks: number;
  metadataFilters: {
    versionStatus: 'current';
    aiAllowed: true;
    permissionScope: 'query_stage';
    matterId?: string | undefined;
  };
  appliedRules: readonly string[];
}

const artifactBudgets = {
  document_profile: { tokenBudget: 1200, maxChunks: 6 },
  key_fields: { tokenBudget: 2200, maxChunks: 12 },
  date_facts: { tokenBudget: 2200, maxChunks: 12 },
  people_organizations: { tokenBudget: 2000, maxChunks: 10 },
  keyword_tags: { tokenBudget: 1600, maxChunks: 8 },
  filing_suggestions: { tokenBudget: 1800, maxChunks: 8 },
  source_outline: { tokenBudget: 2400, maxChunks: 12 },
  retrieval_hints: { tokenBudget: 1600, maxChunks: 8 },
} as const satisfies Record<AiPrepArtifactKind, { tokenBudget: number; maxChunks: number }>;

export function planAiPrepRetrieval(input: {
  artifactKind: AiPrepArtifactKind;
  matterId?: string | undefined;
}): AiPrepRetrievalPlan {
  const budget = artifactBudgets[input.artifactKind];
  return {
    artifactKind: input.artifactKind,
    tokenBudget: budget.tokenBudget,
    maxChunks: budget.maxChunks,
    metadataFilters: {
      versionStatus: 'current',
      aiAllowed: true,
      permissionScope: 'query_stage',
      ...(input.matterId ? { matterId: input.matterId } : {}),
    },
    appliedRules: [
      `ai_prep.retrieval_plan:${input.artifactKind}`,
      `ai_prep.retrieval_budget:max_chunks_${budget.maxChunks}`,
      'ai_prep.metadata_filter:current_version',
      'ai_prep.metadata_filter:ai_allowed_true',
      'ai_prep.permission_filter:query_stage',
    ],
  };
}

export function applyAiPrepRetrievalPlan(
  chunks: readonly AiRetrievedChunk[],
  plan: AiPrepRetrievalPlan,
): AiRetrievedChunk[] {
  const sorted = [...chunks].sort((left, right) => {
    const leftScore = prepChunkScore(left, plan.artifactKind);
    const rightScore = prepChunkScore(right, plan.artifactKind);
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (left.documentId !== right.documentId) return left.documentId.localeCompare(right.documentId);
    if (left.versionId !== right.versionId) return left.versionId.localeCompare(right.versionId);
    if (left.chunkOrdinal !== right.chunkOrdinal) return left.chunkOrdinal - right.chunkOrdinal;
    return left.chunkId.localeCompare(right.chunkId);
  });

  const selected: AiRetrievedChunk[] = [];
  let tokenCount = 0;
  for (const chunk of sorted) {
    if (selected.length >= plan.maxChunks) break;
    if (tokenCount + chunk.tokenCount > plan.tokenBudget) continue;
    selected.push(chunk);
    tokenCount += chunk.tokenCount;
  }
  return selected;
}

function prepChunkScore(chunk: AiRetrievedChunk, artifactKind: AiPrepArtifactKind): number {
  if (artifactKind === 'source_outline') return 1000 - chunk.chunkOrdinal;
  const text = chunk.redactedText.toLowerCase();
  return chunk.score + signalBonus(text, artifactKind) + ordinalBonus(chunk, artifactKind);
}

function ordinalBonus(chunk: AiRetrievedChunk, artifactKind: AiPrepArtifactKind): number {
  if (artifactKind !== 'document_profile') return 0;
  return Math.max(0, 0.2 - chunk.chunkOrdinal * 0.02);
}

function signalBonus(text: string, artifactKind: AiPrepArtifactKind): number {
  switch (artifactKind) {
    case 'key_fields':
      return hasAny(text, [/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/u, /\bkrw\b/u, /₩|원/u])
        ? 0.5
        : 0;
    case 'date_facts':
      return hasAny(text, [/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/u, /\b\d{1,2}월\s*\d{1,2}일/u])
        ? 0.6
        : 0;
    case 'people_organizations':
      return hasAny(text, [/주식회사|법인|회사|대표|담당자|inc\.|llc|ltd\./u]) ? 0.5 : 0;
    case 'keyword_tags':
      return hasAny(text, [/제목|분류|태그|키워드|subject|category/u]) ? 0.3 : 0;
    case 'filing_suggestions':
      return hasAny(text, [/계약|송장|보고서|이메일|증빙|분류|folder|filing/u]) ? 0.4 : 0;
    case 'retrieval_hints':
      return hasAny(text, [/검색|참조|식별|번호|키워드|reference|id/u]) ? 0.3 : 0;
    case 'document_profile':
    case 'source_outline':
      return 0;
  }
}

function hasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
