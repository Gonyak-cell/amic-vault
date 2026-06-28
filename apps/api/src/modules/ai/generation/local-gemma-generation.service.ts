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
  maxTokens?: number | undefined;
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
    const isPrep = options.compileOptions?.purpose === 'file_organization_prep';
    const prepFormatMode = isPrep ? localGemmaPrepFormatMode() : null;
    if (isPrep && prepFormatMode === 'text') {
      const startedAt = performance.now();
      const generated = await gateway.generateText({
        system: compiled.system,
        prompt: `${compiled.prompt}\n\nReturn concise file-organization prep prose only. Do not return JSON. Do not quote source text verbatim.`,
        model: localGemmaModel(),
        temperature: 0,
        maxTokens: options.maxTokens ?? localGemmaMaxTokens(options.compileOptions?.purpose),
        contextLength: localGemmaContextLength(options.compileOptions?.purpose),
        keepAlive: localGemmaKeepAlive(options.compileOptions?.purpose),
        think: false,
      });
      if (generated.status !== 'completed' || !generated.response) {
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
          output: this.guard.parseAndAssert({
            output: prepTextOutput({
              text: generated.response,
              sourceRefs: pack.citationRequirements.sourceRefs,
              allowedClaimKinds: options.compileOptions?.allowedClaimKinds,
            }),
            pack,
          }),
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
    const format =
      isPrep && prepFormatMode === 'json'
        ? 'json'
        : groundedJsonSchema({
            sourceRefs: compiled.sourceRefs,
            allowedClaimKinds: options.compileOptions?.allowedClaimKinds,
            purpose: options.compileOptions?.purpose,
          });
    const startedAt = performance.now();
    const generated = await gateway.generateJson<AiGroundedGenerationOutputDto>(
      {
        system: compiled.system,
        prompt: compiled.prompt,
        format,
        model: localGemmaModel(),
        temperature: 0,
        maxTokens: options.maxTokens ?? localGemmaMaxTokens(options.compileOptions?.purpose),
        contextLength: localGemmaContextLength(options.compileOptions?.purpose),
        keepAlive: localGemmaKeepAlive(options.compileOptions?.purpose),
        think: false,
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
      const output = isPrep
        ? normalizePrepSourceRefs(generated.json, pack.citationRequirements.sourceRefs)
        : generated.json;
      return {
        status: 'completed',
        output: this.guard.parseAndAssert({ output, pack }),
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
  const parsed = Number(process.env.LOCAL_GEMMA_TIMEOUT_MS ?? '300000');
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 300_000;
}

function localGemmaMaxTokens(purpose: EvidencePromptCompileOptions['purpose']): number {
  const envNames =
    purpose === 'file_organization_prep'
      ? ['LOCAL_GEMMA_PREP_MAX_TOKENS', 'LOCAL_GEMMA_MAX_TOKENS']
      : ['LOCAL_GEMMA_MAX_TOKENS'];
  for (const envName of envNames) {
    const parsed = Number(process.env[envName]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return purpose === 'file_organization_prep' ? 320 : 1400;
}

function localGemmaContextLength(purpose: EvidencePromptCompileOptions['purpose']): number | undefined {
  const parsed = Number(process.env.LOCAL_GEMMA_NUM_CTX);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return purpose === 'file_organization_prep' ? 2048 : undefined;
}

function localGemmaKeepAlive(purpose: EvidencePromptCompileOptions['purpose']): string | undefined {
  const raw = process.env.LOCAL_GEMMA_KEEP_ALIVE?.trim();
  if (raw) return raw;
  return purpose === 'file_organization_prep' ? '30s' : undefined;
}

function localGemmaPrepFormatMode(): 'json' | 'schema' | 'text' {
  const raw = process.env.LOCAL_GEMMA_PREP_FORMAT?.trim().toLowerCase();
  if (raw === 'text') return 'text';
  return raw === 'schema' ? 'schema' : 'json';
}

function prepTextOutput(input: {
  text: string;
  sourceRefs: readonly string[];
  allowedClaimKinds: readonly string[] | undefined;
}): AiGroundedGenerationOutputDto {
  const sourceRefs = input.sourceRefs.length > 0 ? input.sourceRefs.slice(0, 20) : ['chunk:source-ref'];
  const primarySourceRef = sourceRefs[0] ?? 'chunk:source-ref';
  const text = normalizePrepText(input.text);
  const claimKind = prepClaimKind(input.allowedClaimKinds);
  return {
    answer: text,
    sections: [
      {
        section_id: 'gemma_prep_text',
        heading: 'File organization prep',
        text,
        source_refs: sourceRefs,
      },
    ],
    claims: [
      {
        claim_id: 'gemma_prep_text_1',
        kind: claimKind,
        text,
        source_refs: [primarySourceRef],
        is_legal_conclusion: false,
      },
    ],
    warnings: [],
  };
}

function prepClaimKind(
  allowedClaimKinds: readonly string[] | undefined,
): AiGroundedGenerationOutputDto['claims'][number]['kind'] {
  const preferred = allowedClaimKinds?.includes('key_fact')
    ? 'key_fact'
    : (allowedClaimKinds?.[0] ?? 'summary');
  switch (preferred) {
    case 'summary':
    case 'key_fact':
    case 'risk':
    case 'issue':
    case 'timeline':
    case 'question':
    case 'clause':
    case 'answer':
      return preferred;
    default:
      return 'summary';
  }
}

function normalizePrepText(input: string): string {
  const normalized = input
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, ' ')
    .trim()
    .slice(0, 1400);
  return normalized.length > 0 ? normalized : 'Gemma produced file organization prep metadata.';
}

function normalizePrepSourceRefs(
  output: AiGroundedGenerationOutputDto,
  allowedSourceRefs: readonly string[],
): AiGroundedGenerationOutputDto {
  if (allowedSourceRefs.length !== 1) return output;
  const fallbackRef = allowedSourceRefs[0];
  if (!fallbackRef) return output;
  return {
    ...output,
    sections: output.sections.map((section) => ({
      ...section,
      source_refs: normalizeRefs(section.source_refs, fallbackRef),
    })),
    claims: output.claims.map((claim) => ({
      ...claim,
      source_refs: normalizeRefs(claim.source_refs, fallbackRef),
    })),
  };
}

function normalizeRefs(refs: readonly string[], fallbackRef: string): string[] {
  return refs.includes(fallbackRef) ? [fallbackRef] : [fallbackRef];
}

function groundedJsonSchema(input: {
  sourceRefs: readonly string[];
  allowedClaimKinds: readonly string[] | undefined;
  purpose: EvidencePromptCompileOptions['purpose'];
}): Record<string, unknown> {
  const sourceRefs = input.sourceRefs.length > 0 ? input.sourceRefs : ['chunk:source-ref'];
  const allowedClaimKinds =
    input.allowedClaimKinds && input.allowedClaimKinds.length > 0
      ? [...new Set(input.allowedClaimKinds)]
      : ['summary', 'key_fact', 'risk', 'issue', 'timeline', 'question', 'clause', 'answer'];
  const isPrep = input.purpose === 'file_organization_prep';
  return {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'sections', 'claims', 'warnings'],
    properties: {
      answer: { type: 'string' },
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: isPrep ? 1 : 12,
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
        maxItems: isPrep ? 1 : 100,
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
