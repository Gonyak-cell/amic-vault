import { describe, expect, it } from 'vitest';
import { AiQuestionClassifier } from './question-classifier';

describe('AiQuestionClassifier', () => {
  const classifier = new AiQuestionClassifier();

  it('routes ordinary questions to local retrieval', () => {
    expect(classifier.classify('find the termination covenant').kind).toBe('retrieval');
  });

  it('blocks graph-dependent questions before R7', () => {
    const result = classifier.classify('show the relationship graph for these parties');

    expect(result.kind).toBe('unsupported_graph');
    expect(result.appliedRules).toContain('question.graph:unsupported_before_r7');
  });

  it('blocks rule-finding questions before R8', () => {
    const result = classifier.classify('run clause classification on this agreement');

    expect(result.kind).toBe('unsupported_rule');
    expect(result.appliedRules).toContain('question.rule_findings:unsupported_before_r8');
  });
});
