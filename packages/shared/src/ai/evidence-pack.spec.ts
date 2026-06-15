import { describe, expect, it } from 'vitest';
import {
  adaptEvidencePackToPrepSourceRefs,
  evidencePackSchema,
  type EvidencePackDto,
} from './evidence-pack';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

function validPack(): EvidencePackDto {
  return evidencePackSchema.parse({
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
  });
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

  it('adapts v1 evidence pack refs to v2 prep source_refs without raw text', () => {
    const adapter = adaptEvidencePackToPrepSourceRefs(validPack());

    expect(adapter.schema_version).toBe('evidence_pack.v2.prep_adapter');
    expect(adapter.compatible_with).toEqual(['evidence_pack.v1']);
    expect(adapter.source_refs).toEqual([`chunk:${uuid}`]);
    expect(adapter.source_ref_map[0]).toMatchObject({
      source_ref: `chunk:${uuid}`,
      citation_ref: `chunk:${uuid}`,
      chunk_id: uuid,
      text_hash: hash,
      source_text_hash: hash,
    });
    expect(JSON.stringify(adapter)).not.toMatch(/redacted context|body|snippet|raw|content/u);
  });

  it('fails closed when prep adapter refs are empty, duplicate, unknown, or mismatched', () => {
    expect(() =>
      adaptEvidencePackToPrepSourceRefs({
        ...validPack(),
        citationRequirements: { required: true, style: 'chunk_ref', sourceRefs: [] },
      }),
    ).toThrow(/requires source refs/u);

    expect(() =>
      adaptEvidencePackToPrepSourceRefs({
        ...validPack(),
        citationRequirements: {
          required: true,
          style: 'chunk_ref',
          sourceRefs: [`chunk:${uuid}`, `chunk:${uuid}`],
        },
      }),
    ).toThrow(/count mismatch|unique/u);

    expect(() =>
      adaptEvidencePackToPrepSourceRefs({
        ...validPack(),
        citationRequirements: {
          required: true,
          style: 'chunk_ref',
          sourceRefs: ['chunk:22222222-2222-4222-8222-222222222222'],
        },
      }),
    ).toThrow(/match chunk citations/u);

    expect(() =>
      adaptEvidencePackToPrepSourceRefs({
        ...validPack(),
        retrievedChunks: [
          {
            ...validPack().retrievedChunks[0]!,
            citationRef: 'chunk:22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    ).toThrow(/match chunk citations/u);
  });
});
