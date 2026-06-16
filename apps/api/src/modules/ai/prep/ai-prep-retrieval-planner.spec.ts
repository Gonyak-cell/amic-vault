import { describe, expect, it } from 'vitest';
import { applyAiPrepRetrievalPlan, planAiPrepRetrieval } from './ai-prep-retrieval-planner';

const baseChunk = {
  documentId: '11111111-1111-4111-8111-111111111112',
  versionId: '11111111-1111-4111-8111-111111111113',
  matterId: '11111111-1111-4111-8111-111111111114',
  parentChunkId: null,
  tokenCount: 100,
  score: 0.2,
  textHash: '1'.repeat(64),
  sourceTextHash: '2'.repeat(64),
};

describe('ai prep retrieval planner', () => {
  it('declares current-version, ai-allowed, query-stage filters before prep selection', () => {
    const plan = planAiPrepRetrieval({
      artifactKind: 'filing_suggestions',
      matterId: '11111111-1111-4111-8111-111111111114',
    });

    expect(plan.metadataFilters).toEqual({
      versionStatus: 'current',
      aiAllowed: true,
      permissionScope: 'query_stage',
      matterId: '11111111-1111-4111-8111-111111111114',
    });
    expect(plan.appliedRules).toEqual(
      expect.arrayContaining([
        'ai_prep.metadata_filter:current_version',
        'ai_prep.metadata_filter:ai_allowed_true',
        'ai_prep.permission_filter:query_stage',
      ]),
    );
  });

  it('prioritizes artifact-specific signals within the deterministic token budget', () => {
    const plan = planAiPrepRetrieval({ artifactKind: 'date_facts' });

    const selected = applyAiPrepRetrievalPlan(
      [
        {
          ...baseChunk,
          chunkId: '11111111-1111-4111-8111-111111111120',
          chunkOrdinal: 2,
          redactedText: '일반 설명',
        },
        {
          ...baseChunk,
          chunkId: '11111111-1111-4111-8111-111111111121',
          chunkOrdinal: 1,
          score: 0.1,
          redactedText: '마감일은 2026-06-16 입니다.',
        },
      ],
      plan,
    );

    expect(selected.map((chunk) => chunk.chunkId)).toEqual([
      '11111111-1111-4111-8111-111111111121',
      '11111111-1111-4111-8111-111111111120',
    ]);
  });

  it('keeps source outline ordering deterministic and bounded', () => {
    const plan = { ...planAiPrepRetrieval({ artifactKind: 'source_outline' }), maxChunks: 2 };

    const selected = applyAiPrepRetrievalPlan(
      [
        {
          ...baseChunk,
          chunkId: '11111111-1111-4111-8111-111111111120',
          chunkOrdinal: 2,
          redactedText: '셋째',
        },
        {
          ...baseChunk,
          chunkId: '11111111-1111-4111-8111-111111111121',
          chunkOrdinal: 0,
          redactedText: '첫째',
        },
        {
          ...baseChunk,
          chunkId: '11111111-1111-4111-8111-111111111122',
          chunkOrdinal: 1,
          redactedText: '둘째',
        },
      ],
      plan,
    );

    expect(selected.map((chunk) => chunk.chunkOrdinal)).toEqual([0, 1]);
  });
});
