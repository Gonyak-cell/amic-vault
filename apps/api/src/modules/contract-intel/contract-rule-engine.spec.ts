import { describe, expect, it } from 'vitest';
import { evaluatePlaybookRule, type ContractRuleFacts, type PlaybookRuleForEvaluation } from './contract-rule-engine';

const matterId = '11111111-1111-4111-8111-111111111001';
const documentId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const clauseId = '11111111-1111-4111-8111-111111111004';
const hash = 'a'.repeat(64);

describe('contract rule engine', () => {
  it('returns deterministic findings for the same rule facts', () => {
    const rule = playbookRule({
      ruleType: 'required_clause',
      expression: { requiredClauseKind: 'section', minCount: 1 },
    });
    const facts = ruleFacts();

    const first = evaluatePlaybookRule(rule, facts);
    const second = evaluatePlaybookRule(rule, facts);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'pass',
      findingCode: 'required_clause.section.pass',
      evidenceRefs: [`clause:${clauseId}`],
    });
    expect(JSON.stringify(first)).not.toMatch(/body|snippet|raw|content|text/u);
  });

  it('flags unknown expressions as unsupported instead of allowing them', () => {
    const finding = evaluatePlaybookRule(
      playbookRule({ ruleType: 'threshold', expression: { metric: 'raw_body', operator: 'gte', value: 1 } }),
      ruleFacts(),
    );

    expect(finding.status).toBe('unsupported');
    expect(finding.findingCode).toBe('threshold.unsupported_expression');
    expect(finding.evidenceRefs).toEqual([]);
  });
});

function playbookRule(input: Partial<PlaybookRuleForEvaluation>): PlaybookRuleForEvaluation {
  return {
    ruleId: '11111111-1111-4111-8111-111111111101',
    ruleKey: 'nda.section.required',
    ruleType: 'required_clause',
    severity: 'critical',
    versionNumber: 1,
    matterId,
    expressionHash: hash,
    expression: {},
    ...input,
  };
}

function ruleFacts(): ContractRuleFacts {
  return {
    matterId,
    documentId,
    clauses: [
      {
        clauseId,
        matterId,
        documentId,
        versionId,
        clauseKind: 'section',
        clauseNumber: '2',
        textHash: hash,
      },
    ],
    terms: [],
    redlineChanges: [],
  };
}
