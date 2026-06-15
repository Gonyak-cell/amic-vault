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
    expect(compiled.prompt).toContain('"source_refs":["chunk:11111111-1111-4111-8111-111111111004"]');
    expect(compiled.prompt).not.toContain('chunk:<id>');
    expect(compiled.prompt).not.toMatch(/title|snippet|raw body|lawyer@example/u);
  });

  it('limits prep prompts to file-organization claim kinds', () => {
    const compiled = new AiEvidencePromptCompiler().compile(evidencePack(), {
      purpose: 'file_organization_prep',
      artifactKind: 'document_profile',
      allowedClaimKinds: ['summary', 'key_fact'],
    });

    expect(compiled.system).toContain('file-organization prep');
    expect(compiled.prompt).toContain('PURPOSE: file_organization_prep');
    expect(compiled.prompt).toContain('ARTIFACT_KIND: document_profile');
    expect(compiled.prompt).toContain('CLAIM_KIND_ALLOWLIST: summary, key_fact');
    expect(compiled.prompt).toContain(
      'SOURCE_REF_RULE: source_refs values must be exact strings from ALLOWED_SOURCE_REFS.',
    );
    expect(compiled.prompt).toContain('"kind":"summary|key_fact"');
    expect(compiled.prompt).not.toMatch(/risk|issue|clause/u);
  });

  it('keeps prep graph facts relation-only and excludes risk/issue/clause inference nodes', () => {
    const pack = {
      ...evidencePack(),
      graphFacts: [
        {
          edgeId: '11111111-1111-4111-8111-111111111020',
          edgeType: 'HAS_DOCUMENT' as const,
          matterId: '11111111-1111-4111-8111-111111111002',
          documentId: '11111111-1111-4111-8111-111111111005',
          sourceNodeId: '11111111-1111-4111-8111-111111111002',
          sourceNodeType: 'matter' as const,
          targetNodeId: '11111111-1111-4111-8111-111111111005',
          targetNodeType: 'document' as const,
          sourceHash,
        },
        {
          edgeId: '11111111-1111-4111-8111-111111111021',
          edgeType: 'HAS_RISK' as const,
          matterId: '11111111-1111-4111-8111-111111111002',
          documentId: '11111111-1111-4111-8111-111111111005',
          sourceNodeId: '11111111-1111-4111-8111-111111111005',
          sourceNodeType: 'document' as const,
          targetNodeId: '11111111-1111-4111-8111-111111111022',
          targetNodeType: 'risk' as const,
          sourceHash,
        },
      ],
    };

    const compiled = new AiEvidencePromptCompiler().compile(pack, {
      purpose: 'file_organization_prep',
      artifactKind: 'source_outline',
      allowedClaimKinds: ['summary', 'key_fact'],
    });

    expect(compiled.prompt).toContain('HAS_DOCUMENT');
    expect(compiled.prompt).not.toContain('HAS_RISK');
    expect(compiled.prompt).not.toContain('11111111-1111-4111-8111-111111111022');
  });

  it('keeps only safe filing/classification rule findings in prep prompts', () => {
    const pack = {
      ...evidencePack(),
      ruleFindings: [
        {
          findingId: 'b'.repeat(64),
          matterId: '11111111-1111-4111-8111-111111111002',
          documentId: '11111111-1111-4111-8111-111111111005',
          versionId: '11111111-1111-4111-8111-111111111006',
          clauseId: null,
          ruleId: '11111111-1111-4111-8111-111111111030',
          ruleKey: 'classification.document_type',
          ruleVersion: 1,
          severity: 'info' as const,
          status: 'pass' as const,
          findingCode: 'classification.document_type.contract',
          findingHash: 'c'.repeat(64),
          evidenceRefs: ['chunk:11111111-1111-4111-8111-111111111004'],
        },
        {
          findingId: 'd'.repeat(64),
          matterId: '11111111-1111-4111-8111-111111111002',
          documentId: '11111111-1111-4111-8111-111111111005',
          versionId: '11111111-1111-4111-8111-111111111006',
          clauseId: '11111111-1111-4111-8111-111111111031',
          ruleId: '11111111-1111-4111-8111-111111111032',
          ruleKey: 'nda.section.required',
          ruleVersion: 1,
          severity: 'critical' as const,
          status: 'fail' as const,
          findingCode: 'required_clause.section.fail',
          findingHash: 'e'.repeat(64),
          evidenceRefs: ['clause:11111111-1111-4111-8111-111111111031'],
        },
      ],
    };

    const compiled = new AiEvidencePromptCompiler().compile(pack, {
      purpose: 'file_organization_prep',
      artifactKind: 'filing_suggestions',
      allowedClaimKinds: ['summary', 'key_fact'],
    });

    expect(compiled.prompt).toContain('classification.document_type');
    expect(compiled.prompt).not.toContain('nda.section.required');
    expect(compiled.prompt).not.toContain('required_clause.section.fail');
    expect(compiled.prompt).not.toContain('clause:11111111-1111-4111-8111-111111111031');
  });
});
