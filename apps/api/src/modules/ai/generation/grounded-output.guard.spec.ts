import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { EvidencePackDto } from '@amic-vault/shared';
import { AiGroundedOutputGuard } from './grounded-output.guard';

const sourceHash = 'b'.repeat(64);
const sourceRef = 'chunk:11111111-1111-4111-8111-111111111004';

function pack(): EvidencePackDto {
  return {
    packId: '11111111-1111-4111-8111-111111111001',
    userQuestion: '요약해줘',
    rewrittenQueries: ['요약해줘'],
    taskType: 'summary',
    matterContext: { matterId: '11111111-1111-4111-8111-111111111002' },
    retrievalScope: {
      tenantId: '11111111-1111-4111-8111-111111111003',
      matterId: '11111111-1111-4111-8111-111111111002',
      mode: 'hybrid',
      modelRoute: 'local_gemma',
      appliedRules: ['retrieval.hybrid:query_stage_scope'],
    },
    relevantDocuments: [],
    authoritativeSources: [],
    retrievedChunks: [
      {
        citationRef: sourceRef,
        documentId: '11111111-1111-4111-8111-111111111005',
        versionId: '11111111-1111-4111-8111-111111111006',
        matterId: '11111111-1111-4111-8111-111111111002',
        chunkId: '11111111-1111-4111-8111-111111111004',
        parentChunkId: null,
        chunkOrdinal: 0,
        tokenCount: 10,
        score: 0.9,
        redactedText: 'authorized text',
        textHash: sourceHash,
        sourceTextHash: sourceHash,
      },
    ],
    omittedChunkIds: [],
    window: { tokenBudget: 2000, tokenCount: 10 },
    graphFacts: [],
    ruleFindings: [],
    conflicts: [],
    uncertainty: [],
    prohibitedAssumptions: ['Do not use facts outside retrieved chunks.'],
    citationRequirements: { required: true, style: 'chunk_ref', sourceRefs: [sourceRef] },
    outputFormat: { kind: 'summary', locale: 'ko-KR' },
    escalationFlags: [],
  };
}

const validOutput = {
  answer: '근거 있는 답변입니다.',
  sections: [{ section_id: 's1', heading: '요지', text: '근거 있는 요지', source_refs: [sourceRef] }],
  claims: [{ claim_id: 'c1', kind: 'summary', text: '근거 있는 주장', source_refs: [sourceRef] }],
};

describe('AiGroundedOutputGuard', () => {
  it('accepts fully cited output using known evidence refs', () => {
    expect(new AiGroundedOutputGuard().parseAndAssert({ output: validOutput, pack: pack() })).toEqual(
      validOutput,
    );
  });

  it('fails closed for unknown refs, uncited claims, and legal conclusions', () => {
    const guard = new AiGroundedOutputGuard();
    expect(() =>
      guard.parseAndAssert({
        output: {
          ...validOutput,
          claims: [{ ...validOutput.claims[0], source_refs: ['chunk:unknown'] }],
        },
        pack: pack(),
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      guard.parseAndAssert({
        output: { ...validOutput, claims: [{ ...validOutput.claims[0], source_refs: [] }] },
        pack: pack(),
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      guard.parseAndAssert({
        output: {
          ...validOutput,
          claims: [{ ...validOutput.claims[0], is_legal_conclusion: true }],
        },
        pack: pack(),
      }),
    ).toThrow(BadRequestException);
  });
});
