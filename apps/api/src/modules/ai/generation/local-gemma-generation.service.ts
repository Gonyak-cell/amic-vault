import { Injectable } from '@nestjs/common';
import { LocalGemmaGateway, localGemmaDefaultModel } from '@amic-vault/ai';
import {
  aiGroundedGenerationOutputSchema,
  type AiGroundedGenerationOutputDto,
  type EvidencePackDto,
} from '@amic-vault/shared';
import {
  AiEvidencePromptCompiler,
  type EvidencePromptCompileOptions,
} from './evidence-prompt.compiler';
import { AiGroundedOutputGuard } from './grounded-output.guard';

export interface LocalGemmaGroundedGenerationResult {
  status: 'completed' | 'blocked';
  output?: AiGroundedGenerationOutputDto | undefined;
  reasonCode?: string | undefined;
  model?: string | undefined;
  latencyMs?: number | undefined;
}

export interface LocalGemmaGroundedGenerationOptions {
  compileOptions?: EvidencePromptCompileOptions | undefined;
  parseOutput?: ((value: unknown) => AiGroundedGenerationOutputDto) | undefined;
}

@Injectable()
export class LocalGemmaGenerationService {
  constructor(
    private readonly compiler: AiEvidencePromptCompiler,
    private readonly guard: AiGroundedOutputGuard,
  ) {}

  async generateGrounded(
    pack: EvidencePackDto,
    options: LocalGemmaGroundedGenerationOptions = {},
  ): Promise<LocalGemmaGroundedGenerationResult> {
    const gateway = new LocalGemmaGateway({
      route: 'local_gemma',
      enabled: localGemmaEnabled(),
      endpoint: localGemmaEndpoint(),
      model: localGemmaModel(),
      timeoutMs: localGemmaTimeoutMs(),
      maxResponseChars: 24_000,
    });
    const compiled = this.compiler.compile(pack, options.compileOptions);
    const format = groundedJsonSchema({
      sourceRefs: compiled.sourceRefs,
      allowedClaimKinds: options.compileOptions?.allowedClaimKinds,
    });
    const startedAt = performance.now();
    const generated = await gateway.generateJson(
      {
        system: compiled.system,
        prompt: compiled.prompt,
        format,
        model: localGemmaModel(),
        temperature: 0,
        maxTokens: 1400,
      },
      options.parseOutput ?? ((value) => aiGroundedGenerationOutputSchema.parse(value)),
    );
    if (generated.status !== 'completed' || !generated.json) {
      return {
        status: 'blocked',
        reasonCode: generated.reasonCode ?? 'generation_failed',
        model: generated.model,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
    try {
      return {
        status: 'completed',
        output: this.guard.parseAndAssert({ output: generated.json, pack }),
        model: generated.model,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch {
      return {
        status: 'blocked',
        reasonCode: 'unsupported_claim',
        model: generated.model,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  }
}

function localGemmaEndpoint(): string {
  return process.env.LOCAL_GEMMA_ENDPOINT ?? process.env.AI_GATEWAY_ENDPOINT ?? 'http://127.0.0.1:11434';
}

function localGemmaModel(): string {
  return process.env.LOCAL_GEMMA_MODEL ?? localGemmaDefaultModel;
}

function localGemmaEnabled(): boolean {
  const raw = process.env.LOCAL_GEMMA_ENABLED ?? process.env.AI_PREP_ENABLED ?? 'true';
  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

function localGemmaTimeoutMs(): number {
  const parsed = Number(process.env.LOCAL_GEMMA_TIMEOUT_MS ?? '30000');
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 30_000;
}

function groundedJsonSchema(input: {
  sourceRefs: readonly string[];
  allowedClaimKinds: readonly string[] | undefined;
}): Record<string, unknown> {
  const sourceRefs = input.sourceRefs.length > 0 ? input.sourceRefs : ['chunk:source-ref'];
  const allowedClaimKinds =
    input.allowedClaimKinds && input.allowedClaimKinds.length > 0
      ? [...new Set(input.allowedClaimKinds)]
      : ['summary', 'key_fact', 'risk', 'issue', 'timeline', 'question', 'clause', 'answer'];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'sections', 'claims', 'warnings'],
    properties: {
      answer: { type: 'string' },
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['section_id', 'heading', 'text', 'source_refs'],
          properties: {
            section_id: { type: 'string' },
            heading: { type: 'string' },
            text: { type: 'string' },
            source_refs: {
              type: 'array',
              minItems: 1,
              maxItems: Math.min(sourceRefs.length, 20),
              items: { type: 'string', enum: sourceRefs },
            },
          },
        },
      },
      claims: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['claim_id', 'kind', 'text', 'source_refs', 'is_legal_conclusion'],
          properties: {
            claim_id: { type: 'string' },
            kind: { type: 'string', enum: allowedClaimKinds },
            text: { type: 'string' },
            source_refs: {
              type: 'array',
              minItems: 1,
              maxItems: Math.min(sourceRefs.length, 20),
              items: { type: 'string', enum: sourceRefs },
            },
            is_legal_conclusion: { type: 'boolean', const: false },
          },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string' },
      },
    },
  };
}
