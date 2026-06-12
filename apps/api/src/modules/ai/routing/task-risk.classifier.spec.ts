import { describe, expect, it } from 'vitest';
import { AiTaskRiskClassifier } from './task-risk.classifier';

describe('AiTaskRiskClassifier', () => {
  const classifier = new AiTaskRiskClassifier();

  it('keeps retrieval low risk and legal conclusions escalated', () => {
    expect(classifier.classify({ taskKind: 'retrieval' })).toMatchObject({
      risk: 'low',
      escalationRequired: false,
    });
    expect(classifier.classify({ taskKind: 'legal_conclusion' })).toMatchObject({
      risk: 'high',
      escalationRequired: true,
      reasonCode: 'high_risk_requires_review',
    });
  });

  it('treats unsupported and unknown tasks conservatively', () => {
    expect(classifier.classify({ taskKind: 'unsupported_graph' })).toMatchObject({
      risk: 'unsupported',
      escalationRequired: true,
      reasonCode: 'unsupported_scope',
    });
    expect(classifier.classify({ prompt: '고객에게 발송할 최종 대외 문안 작성' })).toMatchObject({
      risk: 'high',
      escalationRequired: true,
    });
  });
});
