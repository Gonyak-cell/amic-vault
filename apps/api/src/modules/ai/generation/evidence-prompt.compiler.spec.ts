import { describe, expect, it } from 'vitest';
import type { EvidencePackDto } from '@amic-vault/shared';
import { AiEvidencePromptCompiler } from './evidence-prompt.compiler';

const sourceHash = 'a'.repeat(64);

function evidencePack(): EvidencePackDto {
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
        citationRef: 'chunk:11111111-1111-4111-8111-111111111004',
        documentId: '11111111-1111-4111-8111-111111111005',
        versionId: '11111111-1111-4111-8111-111111111006',
        matterId: '11111111-1111-4111-8111-111111111002',
        chunkId: '11111111-1111-4111-8111-111111111004',
        parentChunkId: null,
        chunkOrdinal: 0,
        tokenCount: 10,
        score: 0.9,
        redactedText: '허가된 [REDACTED:email_address] 문맥',
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
    citationRequirements: {
      required: true,
      style: 'chunk_ref',
      sourceRefs: ['chunk:11111111-1111-4111-8111-111111111004'],
    },
    outputFormat: { kind: 'summary', locale: 'ko-KR' },
    escalationFlags: [],
  };
}

describe('AiEvidencePromptCompiler', () => {
  it('compiles prompts from redacted evidence pack fields and citation refs only', () => {
    const compiled = new AiEvidencePromptCompiler().compile(evidencePack());

    expect(compiled.sourceRefs).toEqual(['chunk:11111111-1111-4111-8111-111111111004']);
    expect(compiled.prompt).toContain('허가된 [REDACTED:email_address] 문맥');
    expect(compiled.prompt).toContain('source_refs');
    expect(compiled.prompt).not.toMatch(/title|snippet|raw body|lawyer@example/u);
  });
});
