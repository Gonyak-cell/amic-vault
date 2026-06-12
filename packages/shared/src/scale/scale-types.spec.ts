import { describe, expect, it } from 'vitest';
import {
  createScaleAiGateReviewRequestSchema,
  createScaleEvalRunRequestSchema,
  createScalePerformanceRunRequestSchema,
} from './scale-types';

const hash = 'a'.repeat(64);

describe('scale learning DTO schemas', () => {
  it('requires monotonic performance percentiles', () => {
    expect(() =>
      createScalePerformanceRunRequestSchema.parse({
        scenario: 'search_query',
        sampleCount: 100,
        p50Ms: 80,
        p95Ms: 120,
        p99Ms: 180,
        targetP95Ms: 200,
        measurementHash: hash,
        evidenceRef: 'r14/perf-search',
      }),
    ).not.toThrow();

    expect(() =>
      createScalePerformanceRunRequestSchema.parse({
        scenario: 'search_query',
        sampleCount: 100,
        p50Ms: 160,
        p95Ms: 120,
        p99Ms: 180,
        targetP95Ms: 200,
        measurementHash: hash,
        evidenceRef: 'r14/perf-search',
      }),
    ).toThrow();
  });

  it('requires eval counts to balance', () => {
    expect(
      createScaleEvalRunRequestSchema.parse({
        suite: 'ai_gate',
        caseCount: 5,
        passCount: 5,
        failCount: 0,
        metricHash: hash,
        evidenceRef: 'r14/eval-ai',
      }).passCount,
    ).toBe(5);

    expect(() =>
      createScaleEvalRunRequestSchema.parse({
        suite: 'ai_gate',
        caseCount: 5,
        passCount: 4,
        failCount: 0,
        metricHash: hash,
        evidenceRef: 'r14/eval-ai',
      }),
    ).toThrow();
  });

  it('keeps external model gate closed by schema', () => {
    expect(
      createScaleAiGateReviewRequestSchema.parse({
        candidateRoute: 'external_model',
        decision: 'external_blocked',
        externalModelAllowed: false,
        controlHash: hash,
        evidenceRef: 'r14/ai-gate',
      }).externalModelAllowed,
    ).toBe(false);

    expect(() =>
      createScaleAiGateReviewRequestSchema.parse({
        candidateRoute: 'external_model',
        decision: 'external_blocked',
        externalModelAllowed: true,
        controlHash: hash,
        evidenceRef: 'r14/ai-gate',
      }),
    ).toThrow();
  });
});
