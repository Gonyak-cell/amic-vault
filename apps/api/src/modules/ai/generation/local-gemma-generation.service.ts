import { Injectable } from '@nestjs/common';
import { LocalGemmaGateway, localGemmaDefaultModel } from '@amic-vault/ai';
import {
  aiGroundedGenerationOutputSchema,
  type AiGroundedGenerationOutputDto,
  type EvidencePackDto,
} from '@amic-vault/shared';
import { AiEvidencePromptCompiler } from './evidence-prompt.compiler';
import { AiGroundedOutputGuard } from './grounded-output.guard';

export interface LocalGemmaGroundedGenerationResult {
  status: 'completed' | 'blocked';
  output?: AiGroundedGenerationOutputDto | undefined;
  reasonCode?: string | undefined;
  model?: string | undefined;
  latencyMs?: number | undefined;
}

@Injectable()
export class LocalGemmaGenerationService {
  constructor(
    private readonly compiler: AiEvidencePromptCompiler,
    private readonly guard: AiGroundedOutputGuard,
  ) {}

  async generateGrounded(pack: EvidencePackDto): Promise<LocalGemmaGroundedGenerationResult> {
    const gateway = new LocalGemmaGateway({
      route: 'local_gemma',
      enabled: localGemmaEnabled(),
      endpoint: localGemmaEndpoint(),
      model: localGemmaModel(),
      timeoutMs: localGemmaTimeoutMs(),
      maxResponseChars: 24_000,
    });
    const compiled = this.compiler.compile(pack);
    const startedAt = performance.now();
    const generated = await gateway.generateJson(
      {
        system: compiled.system,
        prompt: compiled.prompt,
        model: localGemmaModel(),
        temperature: 0,
        maxTokens: 1400,
      },
      (value) => aiGroundedGenerationOutputSchema.parse(value),
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
