import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiOpsService } from './ai-ops.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111112';
const sessionId = '11111111-1111-4111-8111-111111111113';

function createService(queryResults: unknown[] = []) {
  const client = {
    query: vi.fn(async () => {
      const rows = queryResults.shift() as unknown[] | undefined;
      return { rows: rows ?? [], rowCount: rows?.length ?? 0 };
    }),
  };
  const audit = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: never) => Promise<unknown>) =>
      run(client as never),
    ),
    log: vi.fn(async () => ({ eventId: 'event', createdAt: new Date() })),
  };
  return { audit, client, service: new AiOpsService(audit as never) };
}

function mockGemmaReady() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              model: 'gemma4:12b',
              name: 'gemma4:12b',
              details: { parameter_size: '12B', quantization_level: 'Q4_K_M' },
              capabilities: ['completion'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiOpsService', () => {
  it('returns admin-only local Gemma health without exposing endpoint values', async () => {
    mockGemmaReady();
    const { audit, service } = createService([
      [{ role: 'security_admin', status: 'active' }],
      [{ queue_backlog_count: 1, blocked_prep_count: 0, p95_latency_ms: 900 }],
    ]);

    const health = await service.getHealth({ tenantId, userId, sessionId });

    expect(health).toMatchObject({
      status: 'ready',
      modelRoute: 'local_gemma',
      modelName: 'gemma4:12b',
      endpointClass: 'loopback',
    });
    expect(JSON.stringify(health)).not.toMatch(/http|secret|token|prompt|response/i);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SCALE_READINESS_VIEWED',
        targetType: 'local_ai_ops',
        metadata: expect.objectContaining({ model_route: 'local_gemma' }),
      }),
      expect.anything(),
    );
  });

  it('returns aggregate metrics without source text', async () => {
    const { service } = createService([
      [{ role: 'firm_admin', status: 'active' }],
      [
        {
          prep_completed_count: 3,
          prep_blocked_count: 1,
          prep_failed_count: 0,
          prep_stale_count: 1,
          prep_fallback_count: 2,
          stale_rebuild_count: 1,
          generation_completed_count: 2,
          generation_blocked_count: 0,
          invalid_output_count: 1,
          citation_rejected_count: 0,
          p95_prep_latency_ms: 1200,
          p95_generation_latency_ms: 1400,
        },
      ],
    ]);

    const metrics = await service.getMetrics({ tenantId, userId, sessionId });

    expect(metrics.prepCompletedCount).toBe(3);
    expect(metrics.prepFallbackCount).toBe(2);
    expect(JSON.stringify(metrics)).not.toMatch(/body|content|snippet|raw|prompt|response/i);
  });

  it('fails closed for non-admin actors', async () => {
    mockGemmaReady();
    const { service } = createService([[{ role: 'matter_member', status: 'active' }]]);

    await expect(service.getHealth({ tenantId, userId, sessionId })).rejects.toThrow();
  });
});
