import { describe, expect, it } from 'vitest';
import { localAiEvalReportSchema, localAiOpsHealthSchema, localAiOpsMetricsSchema } from './ops';

describe('local AI ops shared contract', () => {
  it('defines health without exposing endpoints or secrets', () => {
    const parsed = localAiOpsHealthSchema.parse({
      status: 'ready',
      modelRoute: 'local_gemma',
      modelName: 'gemma4:12b',
      parameterSize: '12B',
      endpointClass: 'loopback',
      queueBacklogCount: 0,
      p95LatencyMs: 1200,
      blockedPrepCount: 0,
      degradedMode: false,
      reasonCode: null,
    });

    expect(parsed.modelRoute).toBe('local_gemma');
    expect(JSON.stringify(parsed)).not.toMatch(/secret|token|prompt|response|http/i);
  });

  it('defines aggregate metrics only', () => {
    const parsed = localAiOpsMetricsSchema.parse({
      prepCompletedCount: 3,
      prepBlockedCount: 0,
      prepFailedCount: 0,
      prepStaleCount: 1,
      staleRebuildCount: 1,
      generationCompletedCount: 2,
      generationBlockedCount: 0,
      invalidOutputCount: 0,
      citationRejectedCount: 0,
      p95PrepLatencyMs: 900,
      p95GenerationLatencyMs: 1200,
    });

    expect(parsed.prepCompletedCount).toBe(3);
  });

  it('fails the eval report when leakage is observed', () => {
    const parsed = localAiEvalReportSchema.parse({
      tenantId: '11111111-1111-4111-8111-111111111111',
      caseCount: 2,
      deidentifiedCaseCount: 2,
      permissionLeakageCount: 1,
      citationAccuracy: 1,
      unsupportedClaimRate: 0,
      koreanLegalLanguagePass: true,
      p95LatencyMs: 1200,
      technicalPass: false,
      warnings: ['permission leakage observed'],
    });

    expect(parsed.technicalPass).toBe(false);
  });
});
