import { describe, expect, it } from 'vitest';
import { computeLocalAiEvalReport } from './local-ai-eval';

const tenantId = '11111111-1111-4111-8111-111111111111';

describe('local AI eval metrics', () => {
  it('passes when deidentified cases, citations, leakage, and latency satisfy the gate', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 2,
      unsupportedCount: 0,
      leakageCount: 0,
      totalSourceRefs: 4,
      matchedSourceRefs: 4,
      koreanOutputCount: 2,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(true);
  });

  it('fails closed when leakage is observed', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 1,
      unsupportedCount: 0,
      leakageCount: 1,
      totalSourceRefs: 1,
      matchedSourceRefs: 1,
      koreanOutputCount: 1,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.warnings).toContain('Permission or raw-payload leakage observed.');
  });
});
