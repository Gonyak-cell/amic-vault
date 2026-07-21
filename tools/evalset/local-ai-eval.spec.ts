import { describe, expect, it } from 'vitest';
import {
  collectLiveGoldenSetMetrics,
  computeGoldenSetMetrics,
  computeLocalAiEvalReport,
  type SummaryEvaluationInput,
} from './local-ai-eval';

const tenantId = '11111111-1111-4111-8111-111111111111';
const citationA = '11111111-1111-4111-8111-111111111101';
const citationB = '11111111-1111-4111-8111-111111111102';
const citationC = '11111111-1111-4111-8111-111111111103';
const citationD = '11111111-1111-4111-8111-111111111104';

function passingGoldenSetMetrics() {
  return computeGoldenSetMetrics(
    Array.from({ length: 30 }, (_, index) => ({
      expectedAnswerFacts: [`golden fact ${index}`],
      actualAnswerFacts: [`golden fact ${index}`],
      expectedCitationDocumentIds: [citationA],
      actualCitationDocumentIds: [citationA],
    })),
  );
}

describe('local AI eval metrics', () => {
  it('passes when deidentified cases, citations, leakage, and latency satisfy the gate', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 6,
      fallbackCount: 1,
      rejectedCount: 0,
      generatedOutputCount: 5,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 10,
      matchedSourceRefs: 10,
      koreanOutputCount: 5,
      p95LatencyMs: 1200,
      goldenSetMetrics: passingGoldenSetMetrics(),
    });

    expect(report.technicalPass).toBe(true);
    expect(report.fallbackArtifactCount).toBe(1);
    expect(report.rejectedOutputCount).toBe(0);
    expect(report.generatedOutputCount).toBe(5);
    expect(report.fallbackRate).toBeCloseTo(1 / 6);
    expect(report.claimRecall).toBe(1);
    expect(report.citationDocumentJaccard).toBe(1);
  });

  it('computes golden fact recall, precision, and citation Jaccard for the gate', () => {
    const metrics = computeGoldenSetMetrics(
      Array.from({ length: 30 }, () => ({
        expectedAnswerFacts: ['termination notice is 30 days', 'governing law is Korean law', 'late fee is capped'],
        actualAnswerFacts: ['termination notice is 30 days', 'governing law is Korean law', 'extra unsupported fact'],
        expectedCitationDocumentIds: [citationA, citationB, citationC],
        actualCitationDocumentIds: [citationA, citationC, citationD],
      })),
    );

    expect(metrics.claimRecall).toBeCloseTo(2 / 3);
    expect(metrics.claimPrecision).toBeCloseTo(2 / 3);
    expect(metrics.citationDocumentJaccard).toBeCloseTo(2 / 4);

    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 6,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 6,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 6,
      matchedSourceRefs: 6,
      koreanOutputCount: 6,
      p95LatencyMs: 1200,
      goldenSetMetrics: metrics,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.goldenSetPass).toBe(false);
    expect(report.warnings).toContain('Golden-set claim recall is below the evaluation threshold.');
    expect(report.warnings).toContain(
      'Golden-set citation document match is below the evaluation threshold.',
    );
  });

  it('runs every golden-labeled case through a supplied summary evaluator', async () => {
    const matterId = '11111111-1111-4111-8111-111111111120';
    const calls: SummaryEvaluationInput[] = [];
    const rows = [
      {
        case_no: 'EV-LIVE-0001',
        query_text: 'first golden question',
        expected_answer_facts: ['first fact', 'second fact'],
        expected_citation_document_ids: [citationA, citationB],
      },
      {
        case_no: 'EV-LIVE-0002',
        query_text: 'second golden question',
        expected_answer_facts: ['third fact'],
        expected_citation_document_ids: [citationC],
      },
    ];

    const metrics = await collectLiveGoldenSetMetrics({
      client: {
        async query<T = unknown>() {
          return { rows: rows as T[], rowCount: rows.length };
        },
      },
      tenantId,
      matterId,
      evaluateSummary: async (input) => {
        calls.push(input);
        if (input.caseNo === 'EV-LIVE-0001') {
          return {
            claimTexts: ['first fact', 'extra fact'],
            citationDocumentIds: [citationA, citationD],
          };
        }
        return {
          claimTexts: ['third fact'],
          citationDocumentIds: [citationC],
        };
      },
    });

    expect(calls).toEqual([
      { tenantId, matterId, caseNo: 'EV-LIVE-0001', queryText: 'first golden question' },
      { tenantId, matterId, caseNo: 'EV-LIVE-0002', queryText: 'second golden question' },
    ]);
    expect(metrics.claimRecall).toBeCloseTo(2 / 3);
    expect(metrics.claimPrecision).toBeCloseTo(2 / 3);
    expect(metrics.citationDocumentJaccard).toBeCloseTo(((1 / 3) + 1) / 2);
  });

  it('fails closed when leakage is observed', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 1,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 1,
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
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 0,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 0,
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
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 2,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 2,
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
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 5,
      fallbackCount: 5,
      rejectedCount: 0,
      generatedOutputCount: 0,
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

  it('fails closed when fallback rows would otherwise dilute quality denominators', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 8,
      fallbackCount: 7,
      rejectedCount: 0,
      generatedOutputCount: 1,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 1,
      matchedSourceRefs: 1,
      koreanOutputCount: 1,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.generatedOutputCount).toBe(1);
    expect(report.warnings).toContain(
      'Insufficient non-fallback generated local AI outputs observed.',
    );
  });

  it('fails closed when rejected model output would otherwise dilute quality denominators', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 6,
      fallbackCount: 0,
      rejectedCount: 2,
      generatedOutputCount: 6,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 6,
      matchedSourceRefs: 6,
      koreanOutputCount: 6,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.rejectedOutputCount).toBe(2);
    expect(report.unsupportedClaimRate).toBeCloseTo(2 / 8);
    expect(report.warnings).toContain(
      'Unsupported or rejected prep output rate exceeds the technical threshold.',
    );
  });

  it('fails closed when the deidentified corpus is below 100 cases', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 99,
      deidentifiedCaseCount: 99,
      outputCount: 6,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 6,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 6,
      matchedSourceRefs: 6,
      koreanOutputCount: 6,
      p95LatencyMs: 1200,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.warnings).toContain(
      'Deidentified local AI eval corpus is below the 100-case technical threshold.',
    );
  });

  it('fails closed when prep queue age exceeds the technical threshold', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 6,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 6,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 6,
      matchedSourceRefs: 6,
      koreanOutputCount: 6,
      p95LatencyMs: 1200,
      pendingPrepCount: 1,
      maxPendingAgeSeconds: 901,
    });

    expect(report.technicalPass).toBe(false);
    expect(report.warnings).toContain('AI prep queue age exceeds the technical threshold.');
  });

  it('fails closed when per-artifact completion thresholds are not met', () => {
    const report = computeLocalAiEvalReport({
      tenantId,
      caseCount: 100,
      deidentifiedCaseCount: 100,
      outputCount: 6,
      fallbackCount: 0,
      rejectedCount: 0,
      generatedOutputCount: 6,
      unsupportedCount: 0,
      leakageCount: 0,
      prepSchemaViolationCount: 0,
      totalSourceRefs: 6,
      matchedSourceRefs: 6,
      koreanOutputCount: 6,
      p95LatencyMs: 1200,
      artifactKindMetrics: [
        {
          artifactKind: 'document_profile',
          minimumCompletedCount: 20,
          completedCount: 19,
          generatedOutputCount: 19,
          fallbackArtifactCount: 0,
          rejectedOutputCount: 0,
          fallbackRate: 0,
          rejectedRate: 0,
          p95LatencyMs: 1200,
          technicalPass: false,
        },
      ],
    });

    expect(report.technicalPass).toBe(false);
    expect(report.artifactKindMetrics[0]?.technicalPass).toBe(false);
    expect(report.warnings).toContain('Per-artifact local AI prep threshold failed.');
  });
});
