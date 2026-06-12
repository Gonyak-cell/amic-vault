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
      fetch: vi.fn(async () => ({ ok: true, status: 200 })),
    } satisfies GatewayTransport;

    await expect(
      new LocalGemmaGateway(
        { route: 'local_gemma', enabled: true, endpoint: 'http://127.0.0.1:11434' },
        transport,
      ).health(),
    ).resolves.toEqual({ status: 'ready', route: 'local_gemma' });
    expect(transport.fetch).toHaveBeenCalledWith('http://127.0.0.1:11434/health', {
      method: 'GET',
    });
  });

  it('keeps local_gemma as the only R6 enabled model route', () => {
    expect(isR6EnabledModelRoute('local_gemma')).toBe(true);
    expect(isR6EnabledModelRoute('openai_gpt4')).toBe(false);
  });
});
