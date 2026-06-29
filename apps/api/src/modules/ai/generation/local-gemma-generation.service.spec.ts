import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvidencePackDto } from '@amic-vault/shared';
import { AiEvidencePromptCompiler } from './evidence-prompt.compiler';
import { AiGroundedOutputGuard } from './grounded-output.guard';
import { LocalGemmaGenerationService } from './local-gemma-generation.service';

const sourceRef = 'chunk:11111111-1111-4111-8111-111111111004';
const sourceHash = 'a'.repeat(64);

function evidencePack(): EvidencePackDto {
  return {
    packId: '11111111-1111-4111-8111-111111111001',
    userQuestion: '파일 정리 정보를 만들어줘',
    rewrittenQueries: ['파일 정리 정보를 만들어줘'],
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
        redactedText: '업로드된 문서는 계약 검토 관련 회의 메모입니다.',
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
      sourceRefs: [sourceRef],
    },
    outputFormat: { kind: 'summary', locale: 'ko-KR' },
    escalationFlags: [],
  };
}

describe('LocalGemmaGenerationService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses compact generation limits for file-organization prep', async () => {
    vi.stubEnv('LOCAL_GEMMA_ENABLED', 'true');
    vi.stubEnv('LOCAL_GEMMA_ENDPOINT', 'http://127.0.0.1:11434');
    const generateBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          { status: 200 },
        );
      }
      generateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          model: 'gemma4:12b',
          response: JSON.stringify({
            answer: '회의 메모',
            sections: [
              {
                section_id: 's1',
                heading: '문서 성격',
                text: '계약 검토 관련 회의 메모입니다.',
                source_refs: [sourceRef],
              },
            ],
            claims: [
              {
                claim_id: 'c1',
                kind: 'summary',
                text: '계약 검토 회의 메모입니다.',
                source_refs: [sourceRef],
                is_legal_conclusion: false,
              },
            ],
            warnings: [],
          }),
          total_duration: 2_000_000,
          prompt_eval_count: 3,
          eval_count: 4,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new LocalGemmaGenerationService(
        new AiEvidencePromptCompiler(),
        new AiGroundedOutputGuard(),
      ).generateGrounded(evidencePack(), {
        compileOptions: {
          purpose: 'file_organization_prep',
          artifactKind: 'document_profile',
          allowedClaimKinds: ['summary', 'key_fact'],
        },
      }),
    ).resolves.toMatchObject({ status: 'completed', model: 'gemma4:12b' });

    expect(generateBodies).toHaveLength(1);
    const body = generateBodies[0]!;
    expect(body.prompt).toContain('OUTPUT_LIMIT: exactly one section, exactly one claim');
    expect(body.options).toMatchObject({ num_predict: 320, num_ctx: 2048 });
    expect(body.keep_alive).toBe('30s');
    expect(body.format).toBe('json');
    expect(body.think).toBe(false);
  });

  it('honors production Gemma prep runtime overrides', async () => {
    vi.stubEnv('LOCAL_GEMMA_ENABLED', 'true');
    vi.stubEnv('LOCAL_GEMMA_ENDPOINT', 'http://127.0.0.1:11434');
    vi.stubEnv('LOCAL_GEMMA_PREP_MAX_TOKENS', '128');
    vi.stubEnv('LOCAL_GEMMA_NUM_CTX', '1024');
    vi.stubEnv('LOCAL_GEMMA_KEEP_ALIVE', '5m');
    const generateBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
            { status: 200 },
          );
        }
        generateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            model: 'gemma4:12b',
            response: JSON.stringify({
              answer: '회의 메모',
              sections: [
                {
                  section_id: 's1',
                  heading: '문서 성격',
                  text: '계약 검토 관련 회의 메모입니다.',
                  source_refs: [sourceRef],
                },
              ],
              claims: [
                {
                  claim_id: 'c1',
                  kind: 'summary',
                  text: '계약 검토 회의 메모입니다.',
                  source_refs: [sourceRef],
                  is_legal_conclusion: false,
                },
              ],
              warnings: [],
            }),
          }),
          { status: 200 },
        );
      }),
    );

    await new LocalGemmaGenerationService(
      new AiEvidencePromptCompiler(),
      new AiGroundedOutputGuard(),
    ).generateGrounded(evidencePack(), {
      compileOptions: {
        purpose: 'file_organization_prep',
        artifactKind: 'document_profile',
        allowedClaimKinds: ['summary', 'key_fact'],
      },
    });

    expect(generateBodies[0]).toMatchObject({
      keep_alive: '5m',
      options: {
        num_predict: 128,
        num_ctx: 1024,
      },
    });
  });

  it('normalizes placeholder source refs for single-source prep output', async () => {
    vi.stubEnv('LOCAL_GEMMA_ENABLED', 'true');
    vi.stubEnv('LOCAL_GEMMA_ENDPOINT', 'http://127.0.0.1:11434');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            model: 'gemma4:12b',
            response: JSON.stringify({
              answer: '회의 메모',
              sections: [
                {
                  section_id: 's1',
                  heading: '문서 성격',
                  text: '계약 검토 관련 회의 메모입니다.',
                  source_refs: ['chunk:placeholder'],
                },
              ],
              claims: [
                {
                  claim_id: 'c1',
                  kind: 'summary',
                  text: '계약 검토 회의 메모입니다.',
                  source_refs: ['chunk:placeholder'],
                  is_legal_conclusion: false,
                },
              ],
              warnings: [],
            }),
          }),
          { status: 200 },
        );
      }),
    );

    await expect(
      new LocalGemmaGenerationService(
        new AiEvidencePromptCompiler(),
        new AiGroundedOutputGuard(),
      ).generateGrounded(evidencePack(), {
        compileOptions: {
          purpose: 'file_organization_prep',
          artifactKind: 'document_profile',
          allowedClaimKinds: ['summary', 'key_fact'],
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      output: {
        sections: [expect.objectContaining({ source_refs: [sourceRef] })],
        claims: [expect.objectContaining({ source_refs: [sourceRef] })],
      },
    });
  });

  it('can opt back into structured schema format for prep', async () => {
    vi.stubEnv('LOCAL_GEMMA_ENABLED', 'true');
    vi.stubEnv('LOCAL_GEMMA_ENDPOINT', 'http://127.0.0.1:11434');
    vi.stubEnv('LOCAL_GEMMA_PREP_FORMAT', 'schema');
    const generateBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
            { status: 200 },
          );
        }
        generateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            model: 'gemma4:12b',
            response: JSON.stringify({
              answer: '회의 메모',
              sections: [
                {
                  section_id: 's1',
                  heading: '문서 성격',
                  text: '계약 검토 관련 회의 메모입니다.',
                  source_refs: [sourceRef],
                },
              ],
              claims: [
                {
                  claim_id: 'c1',
                  kind: 'summary',
                  text: '계약 검토 회의 메모입니다.',
                  source_refs: [sourceRef],
                  is_legal_conclusion: false,
                },
              ],
              warnings: [],
            }),
          }),
          { status: 200 },
        );
      }),
    );

    await new LocalGemmaGenerationService(
      new AiEvidencePromptCompiler(),
      new AiGroundedOutputGuard(),
    ).generateGrounded(evidencePack(), {
      compileOptions: {
        purpose: 'file_organization_prep',
        artifactKind: 'document_profile',
        allowedClaimKinds: ['summary', 'key_fact'],
      },
    });

    expect(generateBodies[0]?.format).toMatchObject({
      properties: {
        sections: { maxItems: 1 },
        claims: { maxItems: 1 },
      },
    });
  });

  it('can wrap prep text output from Gemma without requiring model JSON', async () => {
    vi.stubEnv('LOCAL_GEMMA_ENABLED', 'true');
    vi.stubEnv('LOCAL_GEMMA_ENDPOINT', 'http://127.0.0.1:11434');
    vi.stubEnv('LOCAL_GEMMA_PREP_FORMAT', 'text');
    const generateBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
            { status: 200 },
          );
        }
        generateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            model: 'gemma4:12b',
            response: '계약 검토 관련 회의 메모로 분류할 수 있습니다.',
          }),
          { status: 200 },
        );
      }),
    );

    await expect(
      new LocalGemmaGenerationService(
        new AiEvidencePromptCompiler(),
        new AiGroundedOutputGuard(),
      ).generateGrounded(evidencePack(), {
        compileOptions: {
          purpose: 'file_organization_prep',
          artifactKind: 'document_profile',
          allowedClaimKinds: ['summary', 'key_fact'],
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      model: 'gemma4:12b',
      output: {
        answer: '계약 검토 관련 회의 메모로 분류할 수 있습니다.',
        warnings: [],
      },
    });

    expect(generateBodies[0]?.format).toBeUndefined();
    expect(generateBodies[0]?.think).toBe(false);
    expect(generateBodies[0]?.prompt).toContain('Do not return JSON');
  });
});
