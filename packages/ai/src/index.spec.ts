import { describe, expect, it, vi } from 'vitest';
import { isR6EnabledModelRoute, LocalGemmaGateway, type GatewayTransport } from './index';

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
    expect(transport.fetch).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
    });
  });

  it('generates text through the local Ollama endpoint only after health passes', async () => {
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
      ).generateText({ prompt: 'health check', maxTokens: 12 }),
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
      }),
    );
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
