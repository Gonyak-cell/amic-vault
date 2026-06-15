import { describe, expect, it, vi } from 'vitest';
import { AiPrepProcessor } from './ai-prep.processor';

const source = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  documentId: '11111111-1111-4111-8111-111111111112',
  versionId: '11111111-1111-4111-8111-111111111113',
  matterId: '11111111-1111-4111-8111-111111111114',
  actorId: '11111111-1111-4111-8111-111111111115',
  title: 'Fixture',
  chunks: [
    {
      documentId: '11111111-1111-4111-8111-111111111112',
      versionId: '11111111-1111-4111-8111-111111111113',
      matterId: '11111111-1111-4111-8111-111111111114',
      chunkId: '11111111-1111-4111-8111-111111111116',
      parentChunkId: '11111111-1111-4111-8111-111111111117',
      chunkOrdinal: 0,
      tokenCount: 12,
      score: 1,
      chunkText: 'source text',
      textHash: '1'.repeat(64),
      sourceTextHash: '2'.repeat(64),
    },
  ],
};

const sourceChunk = source.chunks[0]!;

const payload = {
  tenantId: source.tenantId,
  documentId: source.documentId,
  versionId: source.versionId,
  matterId: source.matterId,
  artifactKind: 'document_profile' as const,
};

type CompletedPrepPayload = {
  claims: Array<{ kind: string }>;
  warnings?: string[];
};

function firstRejectedPayload(repository: {
  upsertRejected: ReturnType<typeof vi.fn>;
}): CompletedPrepPayload | undefined {
  const calls = repository.upsertRejected.mock.calls as unknown as Array<
    [unknown, { payload: CompletedPrepPayload }]
  >;
  return calls[0]?.[1].payload;
}

function createProcessor(
  options: {
    generationStatus?: 'completed' | 'blocked';
    packSourceRefs?: string[] | undefined;
    generationOutput?: {
      answer: string;
      sections: Array<{
        section_id: string;
        heading: string;
        text: string;
        source_refs: string[];
      }>;
      claims: Array<{
        claim_id: string;
        kind: string;
        text: string;
        source_refs: string[];
        is_legal_conclusion?: boolean;
      }>;
    };
  } = {},
) {
  const auditLogs: unknown[] = [];
  const audit = {
    transaction: vi.fn(async (_tenantId: string, run: (client: never) => Promise<unknown>) =>
      run({ query: vi.fn() } as never),
    ),
    log: vi.fn(async (input: unknown) => {
      auditLogs.push(input);
      return { eventId: 'event', createdAt: new Date() };
    }),
  };
  const repository = {
    findTarget: vi.fn(async () => source),
    markSupersededArtifactsStale: vi.fn(async () => []),
    findScopedSource: vi.fn(async () => source),
    buildEvidencePack: vi.fn(() => ({
      packId: '11111111-1111-4111-8111-111111111118',
      userQuestion: 'brief',
      rewrittenQueries: ['brief'],
      taskType: 'summary',
      matterContext: { matterId: source.matterId },
      retrievalScope: {
        tenantId: source.tenantId,
        matterId: source.matterId,
        mode: 'hybrid',
        modelRoute: 'local_gemma',
        appliedRules: ['retrieval.hybrid:query_stage_scope'],
      },
      relevantDocuments: [
        {
          documentId: source.documentId,
          versionIds: [source.versionId],
          chunkCount: 1,
          sourceTextHashes: ['2'.repeat(64)],
        },
      ],
      authoritativeSources: [],
      retrievedChunks: [
        {
          citationRef: `chunk:${sourceChunk.chunkId}`,
          documentId: source.documentId,
          versionId: source.versionId,
          matterId: source.matterId,
          chunkId: sourceChunk.chunkId,
          parentChunkId: sourceChunk.parentChunkId,
          chunkOrdinal: 0,
          tokenCount: 12,
          score: 1,
          redactedText: 'source text',
          textHash: '1'.repeat(64),
          sourceTextHash: '2'.repeat(64),
        },
      ],
      omittedChunkIds: [],
      window: { tokenBudget: 2400, tokenCount: 12 },
      graphFacts: [],
      ruleFindings: [],
      conflicts: [],
      uncertainty: [],
      prohibitedAssumptions: ['Do not use facts outside retrieved chunks.'],
      citationRequirements: {
        required: true,
        style: 'chunk_ref',
        sourceRefs: options.packSourceRefs ?? [`chunk:${sourceChunk.chunkId}`],
      },
      outputFormat: { kind: 'summary', locale: 'ko-KR' },
      escalationFlags: [],
    })),
    upsertCompleted: vi.fn(async () => 'artifact-completed'),
    upsertBlocked: vi.fn(async () => 'artifact-blocked'),
    upsertRejected: vi.fn(async () => 'artifact-rejected'),
  };
  const promptCompiler = {
    compile: vi.fn(() => ({
      system: 'system',
      prompt: 'prompt',
      sourceRefs: [`chunk:${sourceChunk.chunkId}`],
    })),
  };
  const generation = {
    generateGrounded: vi.fn(async () =>
      options.generationStatus === 'blocked'
        ? { status: 'blocked', reasonCode: 'unsupported_claim' }
        : {
            status: 'completed',
            model: 'gemma4:12b',
            latencyMs: 7,
            output: options.generationOutput ?? {
              answer: 'answer',
              sections: [
                {
                  section_id: 'brief',
                  heading: 'Brief',
                  text: 'answer',
                  source_refs: [`chunk:${sourceChunk.chunkId}`],
                },
              ],
              claims: [
                {
                  claim_id: 'claim-1',
                  kind: 'summary',
                  text: 'answer',
                  source_refs: [`chunk:${sourceChunk.chunkId}`],
                  is_legal_conclusion: false,
                },
              ],
            },
          },
    ),
  };
  const processor = new AiPrepProcessor(
    audit as never,
    { evaluate: vi.fn(async () => ({ effect: 'ALLOW' })) } as never,
    repository as never,
    {
      scopeForSearch: vi.fn(async () => ({
        effect: 'ALLOW',
        scope: { sql: 'idx.tenant_id = ?', params: [source.tenantId] },
        appliedRules: ['retrieval.hybrid:query_stage_scope'],
      })),
    } as never,
    {
      redact: vi.fn(() => ({
        effect: 'ALLOW',
        chunks: source.chunks.map((chunk) => ({
          ...chunk,
          redactedText: chunk.chunkText,
        })),
        appliedRules: ['dlp.redaction:no_findings'],
      })),
    } as never,
    promptCompiler as never,
    generation as never,
  );
  return { audit, auditLogs, generation, promptCompiler, repository, processor };
}

describe('AiPrepProcessor', () => {
  it('stores completed grounded prep and audits hashes only', async () => {
    const { auditLogs, repository, processor } = createProcessor();
    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        modelName: 'gemma4:12b',
      }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            generation_result: 'gemma',
            prompt_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
  });

  it('discards legal-analysis claim kinds and records a rejected artifact', async () => {
    const { auditLogs, repository, processor } = createProcessor({
      generationOutput: {
        answer: 'answer',
        sections: [
          {
            section_id: 'brief',
            heading: 'Brief',
            text: 'answer',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'risk',
            text: 'not allowed in prep',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reasonCode: 'AI_PREP_VALIDATION_FAILED',
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    const rejectedPayload = firstRejectedPayload(repository);
    expect(rejectedPayload).toBeDefined();
    if (!rejectedPayload) throw new Error('expected rejected payload');
    expect(JSON.stringify(rejectedPayload)).not.toContain('not allowed in prep');
    expect(rejectedPayload.claims.map((claim) => claim.kind)).toEqual(['key_fact']);
    expect(rejectedPayload.warnings).toContain('LOCAL_GEMMA_AI_PREP_VALIDATION_FAILED_REJECTED');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_REJECTED',
          metadata: expect.objectContaining({
            ai_prep_status: 'rejected',
            generation_result: 'rejected',
            reason_code: 'AI_PREP_VALIDATION_FAILED',
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
  });

  it('passes file-organization compile options into Gemma generation', async () => {
    const { generation, processor, promptCompiler } = createProcessor();

    await processor.handle(payload);

    expect(promptCompiler.compile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        purpose: 'file_organization_prep',
        artifactKind: 'document_profile',
        allowedClaimKinds: ['summary', 'key_fact'],
      }),
    );
    expect(generation.generateGrounded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        compileOptions: expect.objectContaining({
          purpose: 'file_organization_prep',
          artifactKind: 'document_profile',
        }),
      }),
    );
  });

  it('fails closed before Gemma generation when evidence source refs are mismatched', async () => {
    const { auditLogs, generation, repository, processor } = createProcessor({
      packSourceRefs: ['chunk:unknown'],
    });

    await processor.handle(payload);

    expect(generation.generateGrounded).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertBlocked).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH' }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_BLOCKED',
          metadata: expect.objectContaining({
            ai_prep_status: 'blocked',
            reason_code: 'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH',
          }),
        }),
      ]),
    );
  });

  it('records unsupported model output as rejected without storing a raw response', async () => {
    const { auditLogs, repository, processor } = createProcessor({ generationStatus: 'blocked' });
    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'UNSUPPORTED_CLAIM' }),
    );
    const rejectedPayload = firstRejectedPayload(repository);
    expect(rejectedPayload).toBeDefined();
    if (!rejectedPayload) throw new Error('expected rejected payload');
    expect(rejectedPayload.warnings).toContain('LOCAL_GEMMA_UNSUPPORTED_CLAIM_REJECTED');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_REJECTED',
          metadata: expect.objectContaining({
            ai_prep_status: 'rejected',
            generation_result: 'rejected',
            reason_code: 'UNSUPPORTED_CLAIM',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toMatch(/"response"|"prompt"|"raw"/u);
  });
});
