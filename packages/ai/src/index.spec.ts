import { describe, expect, it, vi } from 'vitest';
import {
  isR6EnabledModelRoute,
  LocalEmbeddingGateway,
  LocalGemmaGateway,
  type GatewayTransport,
} from './index';

describe('LocalGemmaGateway', () => {
  it('blocks disabled and non-local routes before transport is called', async () => {
    const transport = { fetch: vi.fn() } as unknown as GatewayTransport;

    await expect(
      new LocalGemmaGateway({ route: 'local_gemma', enabled: false }, transport).health(),
    ).resolves.toMatchObject({ status: 'blocked', reasonCode: 'route_disabled' });
    await expect(
      new LocalGemmaGateway(
        { route: 'local_gemma', enabled: true, endpoint: 'https://api.openai.com' },
        transport,
      ).health(),
    ).resolves.toMatchObject({ status: 'blocked', reasonCode: 'non_local_endpoint' });
    expect(transport.fetch).not.toHaveBeenCalled();
  });

  it('calls only the configured local endpoint when enabled', async () => {
    const transport = {
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            {
              name: 'gemma4:12b',
              model: 'gemma4:12b',
              size: 7_556_508_396,
              digest: 'abc123',
              details: {
                parameter_size: '11.9B',
                quantization_level: 'Q4_K_M',
                context_length: 262_144,
              },
              capabilities: ['completion', 'thinking', 'vision'],
            },
          ],
        }),
      })),
    } satisfies GatewayTransport;

    await expect(
      new LocalGemmaGateway(
        { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
        transport,
      ).health(),
    ).resolves.toMatchObject({
      status: 'ready',
      route: 'local_gemma',
      model: {
        name: 'gemma4:12b',
        contextLength: 262_144,
        capabilities: ['completion', 'thinking', 'vision'],
      },
    });
    expect(transport.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/tags',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('bounds local health checks so busy Ollama does not hold prep jobs active', async () => {
    vi.useFakeTimers();
    const transport = {
      fetch: vi.fn(
        (_url: string, init: Parameters<GatewayTransport['fetch']>[1]) =>
          new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      ),
    } satisfies GatewayTransport;

    try {
      const health = new LocalGemmaGateway(
        {
          route: 'local_gemma',
          enabled: true,
          endpoint: 'http://127.0.0.1:11434',
          timeoutMs: 25,
        },
        transport,
      ).health();

      await vi.advanceTimersByTimeAsync(25);

      await expect(health).resolves.toMatchObject({
        status: 'blocked',
        reasonCode: 'local_endpoint_unhealthy',
      });
      expect(transport.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('generates text through the local Ollama endpoint only after health passes', async () => {
    const transport = {
      fetch: vi.fn(async (url: string, _init) => {
        void _init;
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'gemma4:12b',
            response: '{"answer":"ok"}',
            total_duration: 2_000_000,
            prompt_eval_count: 3,
            eval_count: 4,
          }),
        };
      }),
    } satisfies GatewayTransport;

    await expect(
      new LocalGemmaGateway(
        { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
        transport,
      ).generateText({ prompt: 'health check', maxTokens: 12, contextLength: 2048, keepAlive: '30s' }),
    ).resolves.toMatchObject({
      status: 'completed',
      route: 'local_gemma',
      response: '{"answer":"ok"}',
      promptEvalCount: 3,
      evalCount: 4,
      totalDurationMs: 2,
    });

    expect(transport.fetch).toHaveBeenLastCalledWith(
      'http://127.0.0.1:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"keep_alive":"30s"'),
      }),
    );
    const requestBody = JSON.parse(String(transport.fetch.mock.calls.at(-1)?.[1].body)) as Record<
      string,
      unknown
    >;
    expect(requestBody).toMatchObject({
      options: {
        num_predict: 12,
        num_ctx: 2048,
      },
    });
  });

  it('rejects invalid json and schema-invalid generated output', async () => {
    const transport = {
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ model: 'gemma4:12b', response: '{"answer":true}' }),
        };
      }),
    } satisfies GatewayTransport;

    const gateway = new LocalGemmaGateway(
      { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
      transport,
    );

    await expect(
      gateway.generateJson({ prompt: 'json' }, (value) => {
        if (
          value &&
          typeof value === 'object' &&
          'answer' in value &&
          typeof value.answer === 'string'
        ) {
          return value;
        }
        throw new Error('schema invalid');
      }),
    ).resolves.toMatchObject({ status: 'blocked', reasonCode: 'schema_invalid' });
  });

  it('extracts a generated JSON object from prose without storing source text', async () => {
    const transport = {
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'gemma4:12b',
            response: '완료했습니다.\\n```json\\n{"answer":"ok","note":"brace } in string"}\\n```',
          }),
        };
      }),
    } satisfies GatewayTransport;

    const gateway = new LocalGemmaGateway(
      { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
      transport,
    );

    await expect(
      gateway.generateJson({ prompt: 'json' }, (value) => value),
    ).resolves.toMatchObject({
      status: 'completed',
      json: { answer: 'ok', note: 'brace } in string' },
    });
  });

  it('extracts a generated JSON object before trailing prose', async () => {
    const transport = {
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'gemma4:12b',
            response: '{"answer":"ok"}\\n처리가 끝났습니다.',
          }),
        };
      }),
    } satisfies GatewayTransport;

    const gateway = new LocalGemmaGateway(
      { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
      transport,
    );

    await expect(
      gateway.generateJson({ prompt: 'json' }, (value) => value),
    ).resolves.toMatchObject({ status: 'completed', json: { answer: 'ok' } });
  });

  it('passes structured JSON schema format through to Ollama generation', async () => {
    const schema = {
      type: 'object',
      required: ['answer'],
      properties: { answer: { type: 'string' } },
    };
    const transport = {
      fetch: vi.fn(async (url: string, init) => {
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          };
        }
        expect(JSON.parse(init.body ?? '{}')).toMatchObject({ format: schema });
        return {
          ok: true,
          status: 200,
          json: async () => ({ model: 'gemma4:12b', response: '{"answer":"ok"}' }),
        };
      }),
    } satisfies GatewayTransport;

    const gateway = new LocalGemmaGateway(
      { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
      transport,
    );

    await expect(
      gateway.generateJson({ prompt: 'json', format: schema }, (value) => value),
    ).resolves.toMatchObject({ status: 'completed', json: { answer: 'ok' } });
  });

  it('default transport exposes response json for health and generation', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma4:12b', model: 'gemma4:12b' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ model: 'gemma4:12b', response: '{"answer":"ok"}' }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new LocalGemmaGateway({
      route: 'local_gemma',
      enabled: true,
      endpoint: 'http://127.0.0.1:11434',
    });

    try {
      await expect(
        gateway.generateJson({ prompt: 'json' }, (value) => {
          if (
            value &&
            typeof value === 'object' &&
            'answer' in value &&
            typeof value.answer === 'string'
          ) {
            return value;
          }
          throw new Error('schema invalid');
        }),
      ).resolves.toMatchObject({ status: 'completed', json: { answer: 'ok' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps local_gemma as the only R6 enabled model route', () => {
    expect(isR6EnabledModelRoute('local_gemma')).toBe(true);
    expect(isR6EnabledModelRoute('openai_gpt4')).toBe(false);
  });
});

describe('LocalEmbeddingGateway', () => {
  const embedding1024 = Array.from({ length: 1024 }, (_value, index) => index / 1024);

  it('embeds text through Ollama /api/embed with an explicit bge-m3 1024-dimension request', async () => {
    const transport = {
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: 'bge-m3',
          embeddings: [embedding1024],
          total_duration: 7_000_000,
          load_duration: 1_000_000,
          prompt_eval_count: 12,
        }),
      })),
    } satisfies GatewayTransport;

    await expect(
      new LocalEmbeddingGateway(
        { enabled: true, endpoint: 'http://127.0.0.1:11434', model: 'bge-m3' },
        transport,
      ).embedText({ text: '계약 해지와 손해배상 검토' }),
    ).resolves.toMatchObject({
      status: 'completed',
      route: 'bge_m3',
      embedding: embedding1024,
      model: 'bge-m3',
      totalDurationMs: 7,
      loadDurationMs: 1,
      promptEvalCount: 12,
    });

    expect(transport.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/embed',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );
    const calls = vi.mocked(transport.fetch).mock.calls as unknown as Array<
      Parameters<GatewayTransport['fetch']>
    >;
    const requestBody = JSON.parse(String(calls[0]?.[1].body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      dimensions: 1024,
      input: ['계약 해지와 손해배상 검토'],
      model: 'bge-m3',
      truncate: true,
    });
  });

  it('embeds batches and rejects wrong dimensions explicitly', async () => {
    const transport = {
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: 'bge-m3',
          embeddings: [embedding1024, [0.1, 0.2]],
        }),
      })),
    } satisfies GatewayTransport;

    await expect(
      new LocalEmbeddingGateway(
        { enabled: true, endpoint: 'http://localhost:11434', model: 'bge-m3' },
        transport,
      ).embedBatch({ texts: ['first', 'second'] }),
    ).resolves.toMatchObject({
      status: 'blocked',
      reasonCode: 'embedding_dimension_mismatch',
    });
  });

  it('returns explicit timeout and endpoint failures without calling external hosts', async () => {
    vi.useFakeTimers();
    const timeoutTransport = {
      fetch: vi.fn(
        (_url: string, init: Parameters<GatewayTransport['fetch']>[1]) =>
          new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      ),
    } satisfies GatewayTransport;

    try {
      const timeoutResult = new LocalEmbeddingGateway(
        {
          enabled: true,
          endpoint: 'http://127.0.0.1:11434',
          model: 'bge-m3',
          timeoutMs: 25,
        },
        timeoutTransport,
      ).embedText({ text: 'slow' });

      await vi.advanceTimersByTimeAsync(25);

      await expect(timeoutResult).resolves.toMatchObject({
        status: 'blocked',
        reasonCode: 'embedding_timeout',
      });
    } finally {
      vi.useRealTimers();
    }

    const externalTransport = { fetch: vi.fn() } as unknown as GatewayTransport;
    await expect(
      new LocalEmbeddingGateway(
        { enabled: true, endpoint: 'https://api.openai.com', model: 'bge-m3' },
        externalTransport,
      ).embedText({ text: 'blocked' }),
    ).resolves.toMatchObject({ status: 'blocked', reasonCode: 'non_local_endpoint' });
    expect(externalTransport.fetch).not.toHaveBeenCalled();
  });
});
