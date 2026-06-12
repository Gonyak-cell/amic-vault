import { describe, expect, it } from 'vitest';
import { evidencePackSchema } from './evidence-pack';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

function validPack() {
  return {
    packId: uuid,
    userQuestion: 'summarize the termination clause',
    rewrittenQueries: ['summarize the termination clause'],
    taskType: 'retrieval',
    matterContext: { matterId: uuid },
    retrievalScope: {
      tenantId: uuid,
      matterId: uuid,
      mode: 'hybrid',
      modelRoute: 'local_gemma',
      appliedRules: ['retrieval.hybrid:query_stage_scope'],
    },
    relevantDocuments: [
      {
        documentId: uuid,
        versionIds: [uuid],
        chunkCount: 1,
        sourceTextHashes: [hash],
      },
    ],
    authoritativeSources: [],
    retrievedChunks: [
      {
        citationRef: `chunk:${uuid}`,
        documentId: uuid,
        versionId: uuid,
        matterId: uuid,
        chunkId: uuid,
        parentChunkId: null,
        chunkOrdinal: 0,
        tokenCount: 5,
        score: 0.9,
        redactedText: 'redacted context only',
        textHash: hash,
        sourceTextHash: hash,
      },
    ],
    omittedChunkIds: [],
    window: { tokenBudget: 100, tokenCount: 5 },
    graphFacts: [],
    ruleFindings: [],
    conflicts: [],
    uncertainty: [],
    prohibitedAssumptions: ['Do not use facts outside retrieved chunks.'],
    citationRequirements: {
      required: true,
      style: 'chunk_ref',
      sourceRefs: [`chunk:${uuid}`],
    },
    outputFormat: { kind: 'retrieval', locale: 'ko-KR' },
    escalationFlags: [],
  };
}

describe('evidencePackSchema', () => {
  it('accepts the R6 degraded evidence pack contract', () => {
    const parsed = evidencePackSchema.parse(validPack());

    expect(parsed.graphFacts).toEqual([]);
    expect(parsed.ruleFindings).toEqual([]);
  });

  it('accepts R7 graph facts and R8 rule findings as reference-only evidence', () => {
    expect(
      evidencePackSchema.parse({
        ...validPack(),
        graphFacts: [
          {
            edgeId: uuid,
            edgeType: 'HAS_DOCUMENT',
            matterId: uuid,
            documentId: uuid,
            sourceNodeId: uuid,
            sourceNodeType: 'matter',
            targetNodeId: uuid,
            targetNodeType: 'document',
            sourceHash: hash,
          },
        ],
      }).graphFacts,
    ).toHaveLength(1);
    const parsed = evidencePackSchema.parse({
      ...validPack(),
      ruleFindings: [
        {
          findingId: hash,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseId: uuid,
          ruleId: uuid,
          ruleKey: 'nda.section.required',
          ruleVersion: 1,
          severity: 'critical',
          status: 'pass',
          findingCode: 'required_clause.section.pass',
          findingHash: hash,
          evidenceRefs: [`clause:${uuid}`],
        },
      ],
    });
    expect(parsed.ruleFindings).toHaveLength(1);
    expect(JSON.stringify(parsed.ruleFindings)).not.toMatch(/body|snippet|raw|content|text/u);
  });

  it('rejects evidence packs that exceed the context window budget', () => {
    expect(() =>
      evidencePackSchema.parse({
        ...validPack(),
        window: { tokenBudget: 4, tokenCount: 5 },
      }),
    ).toThrow(/window token count exceeds budget/u);
  });
});
