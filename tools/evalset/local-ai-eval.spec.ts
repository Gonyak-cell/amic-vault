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
      fallbackCount: 1,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 4,
      matchedSourceRefs: 4,
      koreanOutputCount: 2,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(true);
    expect(report.fallbackArtifactCount).toBe(1);
    expect(report.fallbackRate).toBe(0.5);
  });

  it('fails closed when leakage is observed', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 1,
      fallbackCount: 0,
      unsupportedCount: 0,
      leakageCount: 1,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 1,
      matchedSourceRefs: 1,
      koreanOutputCount: 1,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.warnings).toContain('Permission or raw-payload leakage observed.');
  });

  it('fails closed when no completed local AI output exists', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 0,
      fallbackCount: 0,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 0,
      matchedSourceRefs: 0,
      koreanOutputCount: 0,
      p95LatencyMs: null,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.completedOutputCount).toBe(0);
    expect(report.warnings).toContain('No completed local AI outputs observed.');
  });

  it('fails closed when prep artifact schema violations are observed', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 2,
      fallbackCount: 0,
      unsupportedCount: 1,
      leakageCount: 0,
      prepSchemaViolationCount: 1,
      totalSourceRefs: 4,
      matchedSourceRefs: 4,
      koreanOutputCount: 2,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.prepSchemaViolationCount).toBe(1);
    expect(report.warnings).toContain('Prep artifact schema violations observed.');
  });

  it('fails closed when the fallback rate exceeds the technical threshold', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 2,
      deidentifiedCaseCount: 2,
      outputCount: 5,
      fallbackCount: 5,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 5,
      matchedSourceRefs: 5,
      koreanOutputCount: 5,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.fallbackRate).toBe(1);
    expect(report.warnings).toContain('Fallback artifact rate exceeds the technical threshold.');
  });
});
