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
  artifactKind: 'document_brief' as const,
};

function createProcessor(options: { generationStatus?: 'completed' | 'blocked' } = {}) {
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
        sourceRefs: [`chunk:${sourceChunk.chunkId}`],
      },
      outputFormat: { kind: 'summary', locale: 'ko-KR' },
      escalationFlags: [],
    })),
    upsertCompleted: vi.fn(async () => 'artifact-completed'),
    upsertBlocked: vi.fn(async () => 'artifact-blocked'),
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
    {
      compile: vi.fn(() => ({
        system: 'system',
        prompt: 'prompt',
        sourceRefs: [`chunk:${sourceChunk.chunkId}`],
      })),
    } as never,
    {
      generateGrounded: vi.fn(async () =>
        options.generationStatus === 'blocked'
          ? { status: 'blocked', reasonCode: 'unsupported_claim' }
          : {
              status: 'completed',
              model: 'gemma4:12b',
              latencyMs: 7,
              output: {
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
    } as never,
  );
  return { audit, auditLogs, repository, processor };
}

describe('AiPrepProcessor', () => {
  it('stores completed grounded prep and audits hashes only', async () => {
    const { auditLogs, repository, processor } = createProcessor();
    await processor.handle(payload);

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
            prompt_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
  });

  it('blocks unsupported model output without storing a raw response', async () => {
    const { auditLogs, repository, processor } = createProcessor({ generationStatus: 'blocked' });
    await processor.handle(payload);

    expect(repository.upsertBlocked).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'UNSUPPORTED_CLAIM' }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_BLOCKED',
          metadata: expect.not.objectContaining({ response: expect.anything() }),
        }),
      ]),
    );
  });
});
