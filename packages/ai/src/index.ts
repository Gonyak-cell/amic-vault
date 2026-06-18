import type { AiModelRoute, ErrorCode } from '@amic-vault/shared';

export interface RetrievalRequest {
  tenantId: string;
  userId: string;
  matterId: string;
  query: string;
}

export interface RetrievalResult {
  status: 'not-implemented-before-r6';
  deniedCode?: ErrorCode;
}

export interface RetrievalOrchestrator {
  /**
   * Legacy interface retained for package consumers; concrete retrieval lives in
   * the API module where Permission-before-AI can be enforced.
   */
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}

export const localGemmaDefaultModel = 'gemma4:12b';

export interface LocalGemmaRouteConfig {
  route: AiModelRoute;
  enabled: boolean;
  endpoint?: string | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  maxResponseChars?: number | undefined;
}

export interface LocalGemmaModelInfo {
  name: string;
  digest?: string | undefined;
  size?: number | undefined;
  parameterSize?: string | undefined;
  quantizationLevel?: string | undefined;
  contextLength?: number | undefined;
  capabilities: readonly string[];
}

export interface LocalGemmaHealthResult {
  status: 'ready' | 'blocked';
  route: AiModelRoute;
  reasonCode?:
    | 'route_disabled'
    | 'endpoint_missing'
    | 'non_local_endpoint'
    | 'local_endpoint_unhealthy'
    | 'model_missing';
  model?: LocalGemmaModelInfo | undefined;
}

export interface LocalGemmaGenerateTextInput {
  prompt: string;
  system?: string | undefined;
  model?: string | undefined;
  format?: 'json' | Record<string, unknown> | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  contextLength?: number | undefined;
  keepAlive?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface LocalGemmaGenerateTextResult {
  status: 'completed' | 'blocked';
  route: AiModelRoute;
  response?: string | undefined;
  reasonCode?:
    | NonNullable<LocalGemmaHealthResult['reasonCode']>
    | 'generation_failed'
    | 'response_too_large';
  model?: string | undefined;
  promptEvalCount?: number | undefined;
  evalCount?: number | undefined;
  totalDurationMs?: number | undefined;
}

export interface LocalGemmaGenerateJsonResult<T> {
  status: 'completed' | 'blocked';
  route: AiModelRoute;
  json?: T | undefined;
  rawResponse?: string | undefined;
  reasonCode?:
    | LocalGemmaGenerateTextResult['reasonCode']
    | 'invalid_json'
    | 'schema_invalid';
  model?: string | undefined;
  promptEvalCount?: number | undefined;
  evalCount?: number | undefined;
  totalDurationMs?: number | undefined;
}

export interface GatewayTransport {
  fetch(
    url: string,
    init: {
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    json?: (() => Promise<unknown>) | undefined;
    text?: (() => Promise<string>) | undefined;
  }>;
}

export class LocalGemmaGateway {
  constructor(
    private readonly config: LocalGemmaRouteConfig,
    private readonly transport: GatewayTransport = defaultTransport(),
  ) {}

  async health(): Promise<LocalGemmaHealthResult> {
    if (!this.config.enabled) return blocked('route_disabled');
    if (!this.config.endpoint) return blocked('endpoint_missing');
    const endpoint = localEndpoint(this.config.endpoint);
    if (!endpoint) return blocked('non_local_endpoint');
    const response = await this.transport.fetch(new URL('/api/tags', endpoint).toString(), {
      method: 'GET',
    });
    if (!response.ok) return blocked('local_endpoint_unhealthy');
    const body = await safeJson(response);
    const model = findModel(body, this.config.model ?? localGemmaDefaultModel);
    if (!model) return blocked('model_missing');
    return { status: 'ready', route: 'local_gemma', model };
  }

  async generateText(input: LocalGemmaGenerateTextInput): Promise<LocalGemmaGenerateTextResult> {
    const health = await this.health();
    if (health.status !== 'ready') {
      return {
        status: 'blocked',
        route: 'local_gemma',
        reasonCode: health.reasonCode ?? 'local_endpoint_unhealthy',
      };
    }
    const endpoint = localEndpoint(this.config.endpoint ?? '');
    if (!endpoint) return { status: 'blocked', route: 'local_gemma', reasonCode: 'non_local_endpoint' };

    const timeoutMs = input.timeoutMs ?? this.config.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.transport.fetch(new URL('/api/generate', endpoint).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model ?? this.config.model ?? localGemmaDefaultModel,
          prompt: input.prompt,
          stream: false,
          ...(input.format ? { format: input.format } : {}),
          ...(input.system ? { system: input.system } : {}),
          ...(input.keepAlive ? { keep_alive: input.keepAlive } : {}),
          options: {
            ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
            ...(input.maxTokens === undefined ? {} : { num_predict: input.maxTokens }),
            ...(input.contextLength === undefined ? {} : { num_ctx: input.contextLength }),
          },
        }),
      });
      if (!response.ok) {
        return { status: 'blocked', route: 'local_gemma', reasonCode: 'generation_failed' };
      }
      const body = ollamaGenerateResponseSchema(await safeJson(response));
      const maxResponseChars = this.config.maxResponseChars ?? 24_000;
      if (body.response.length > maxResponseChars) {
        return { status: 'blocked', route: 'local_gemma', reasonCode: 'response_too_large' };
      }
      return {
        status: 'completed',
        route: 'local_gemma',
        response: body.response,
        model: body.model,
        promptEvalCount: body.prompt_eval_count,
        evalCount: body.eval_count,
        totalDurationMs: body.total_duration ? Math.round(body.total_duration / 1_000_000) : undefined,
      };
    } catch {
      return { status: 'blocked', route: 'local_gemma', reasonCode: 'generation_failed' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateJson<T>(
    input: LocalGemmaGenerateTextInput,
    parse: (value: unknown) => T,
  ): Promise<LocalGemmaGenerateJsonResult<T>> {
    const result = await this.generateText({ ...input, format: input.format ?? 'json' });
    if (result.status !== 'completed' || !result.response) return result;
    let decoded: unknown;
    try {
      decoded = JSON.parse(extractJsonPayload(result.response));
    } catch {
      return { ...result, status: 'blocked', reasonCode: 'invalid_json', rawResponse: result.response };
    }
    try {
      return { ...result, json: parse(decoded), rawResponse: result.response };
    } catch {
      return { ...result, status: 'blocked', reasonCode: 'schema_invalid', rawResponse: result.response };
    }
  }
}

export function isR6EnabledModelRoute(route: string): route is AiModelRoute {
  return route === 'local_gemma';
}

function blocked(reasonCode: NonNullable<LocalGemmaHealthResult['reasonCode']>): LocalGemmaHealthResult {
  return { status: 'blocked', route: 'local_gemma', reasonCode };
}

function defaultTransport(): GatewayTransport {
  return {
    async fetch(url, init) {
      const requestInit: RequestInit = { method: init.method };
      if (init.headers) requestInit.headers = init.headers;
      if (init.body) requestInit.body = init.body;
      if (init.signal) requestInit.signal = init.signal;
      const response = await fetch(url, requestInit);
      return {
        ok: response.ok,
        status: response.status,
        json: () => response.json() as Promise<unknown>,
        text: () => response.text(),
      };
    },
  };
}

function localEndpoint(endpoint: string): URL | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === 'gemma' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.svc') ||
    isPrivateIpv4(host)
  ) {
    return url;
  }
  return null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function safeJson(response: Awaited<ReturnType<GatewayTransport['fetch']>>): Promise<unknown> {
  if (response.json) return response.json();
  if (response.text) return JSON.parse(await response.text());
  return null;
}

function findModel(body: unknown, expectedName: string): LocalGemmaModelInfo | null {
  if (!body || typeof body !== 'object' || !('models' in body) || !Array.isArray(body.models)) {
    return null;
  }
  const models = body.models as unknown[];
  for (const item of models) {
    if (!item || typeof item !== 'object') continue;
    const model = 'model' in item && typeof item.model === 'string' ? item.model : null;
    const name = 'name' in item && typeof item.name === 'string' ? item.name : model;
    if (model !== expectedName && name !== expectedName) continue;
    const details =
      'details' in item && item.details && typeof item.details === 'object'
        ? (item.details as Record<string, unknown>)
        : {};
    const itemRecord = item as Record<string, unknown>;
    const capabilities =
      Array.isArray(itemRecord.capabilities)
        ? itemRecord.capabilities.filter((value): value is string => typeof value === 'string')
        : [];
    return {
      name: name ?? expectedName,
      digest: 'digest' in item && typeof item.digest === 'string' ? item.digest : undefined,
      size: 'size' in item && typeof item.size === 'number' ? item.size : undefined,
      parameterSize:
        'parameter_size' in details && typeof details.parameter_size === 'string'
          ? details.parameter_size
          : undefined,
      quantizationLevel:
        'quantization_level' in details && typeof details.quantization_level === 'string'
          ? details.quantization_level
          : undefined,
      contextLength:
        'context_length' in details && typeof details.context_length === 'number'
          ? details.context_length
          : undefined,
      capabilities,
    };
  }
  return null;
}

function ollamaGenerateResponseSchema(body: unknown): {
  model: string;
  response: string;
  total_duration?: number | undefined;
  prompt_eval_count?: number | undefined;
  eval_count?: number | undefined;
} {
  if (!body || typeof body !== 'object') throw new Error('invalid generate response');
  const model = 'model' in body && typeof body.model === 'string' ? body.model : localGemmaDefaultModel;
  const response = 'response' in body && typeof body.response === 'string' ? body.response : null;
  if (response === null) throw new Error('invalid generate response');
  return {
    model,
    response,
    total_duration:
      'total_duration' in body && typeof body.total_duration === 'number'
        ? body.total_duration
        : undefined,
    prompt_eval_count:
      'prompt_eval_count' in body && typeof body.prompt_eval_count === 'number'
        ? body.prompt_eval_count
        : undefined,
    eval_count: 'eval_count' in body && typeof body.eval_count === 'number' ? body.eval_count : undefined,
  };
}

function extractJsonPayload(value: string): string {
  const stripped = stripJsonFence(value);
  const direct = stripped.trim();
  return firstJsonValue(direct) ?? direct;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function firstJsonValue(value: string): string | null {
  const objectStart = value.indexOf('{');
  const arrayStart = value.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if (char === '}' || char === ']') {
      if (stack.pop() !== char) return null;
      if (stack.length === 0) return value.slice(start, index + 1).trim();
    }
  }
  return null;
}
