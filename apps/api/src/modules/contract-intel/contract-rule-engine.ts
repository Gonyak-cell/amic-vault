import { createHash } from 'node:crypto';

export type RuleEvaluationStatus = 'pass' | 'fail' | 'unsupported';
export type ContractClauseKind = 'article' | 'section' | 'paragraph' | 'definition';
export type PlaybookRuleType = 'required_clause' | 'prohibited_term' | 'threshold';
export type PlaybookRuleSeverity = 'info' | 'warning' | 'critical';

export interface PlaybookRuleForEvaluation {
  ruleId: string;
  ruleKey: string;
  ruleType: PlaybookRuleType;
  severity: PlaybookRuleSeverity;
  versionNumber: number;
  matterId: string | null;
  expressionHash: string;
  expression: Record<string, unknown>;
}

export interface ContractRuleClauseFact {
  clauseId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseKind: ContractClauseKind;
  clauseNumber: string;
  textHash: string;
}

export interface ContractRuleTermFact {
  termId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseId: string;
  normalizedTermKey: string;
  definitionHash: string;
}

export interface ContractRuleRedlineFact {
  redlineChangeId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseId: string | null;
  changeType: 'added' | 'deleted';
  textHash: string;
}

export interface ContractRuleFacts {
  matterId: string;
  documentId: string | null;
  clauses: readonly ContractRuleClauseFact[];
  terms: readonly ContractRuleTermFact[];
  redlineChanges: readonly ContractRuleRedlineFact[];
}

export interface ContractRuleFinding {
  findingId: string;
  matterId: string;
  documentId: string | null;
  versionId: string | null;
  clauseId: string | null;
  ruleId: string;
  ruleKey: string;
  ruleVersion: number;
  severity: PlaybookRuleSeverity;
  status: RuleEvaluationStatus;
  findingCode: string;
  findingHash: string;
  evidenceRefs: string[];
}

const clauseKinds = new Set<ContractClauseKind>(['article', 'section', 'paragraph', 'definition']);
const thresholdMetrics = new Set([
  'clause_count',
  'defined_term_count',
  'defined_term_conflict_count',
  'redline_change_count',
]);
const thresholdOperators = new Set(['eq', 'gte', 'lte']);

export function evaluatePlaybookRule(
  rule: PlaybookRuleForEvaluation,
  facts: ContractRuleFacts,
): ContractRuleFinding {
  if (rule.ruleType === 'required_clause') return evaluateRequiredClause(rule, facts);
  if (rule.ruleType === 'prohibited_term') return evaluateProhibitedTerm(rule, facts);
  if (rule.ruleType === 'threshold') return evaluateThreshold(rule, facts);
  return finding(rule, facts, {
    status: 'unsupported',
    findingCode: 'rule.unsupported_type',
    evidenceRefs: [],
  });
}

function evaluateRequiredClause(
  rule: PlaybookRuleForEvaluation,
  facts: ContractRuleFacts,
): ContractRuleFinding {
  const requiredClauseKind = stringValue(rule.expression.requiredClauseKind ?? rule.expression.clauseKind);
  const minCount = integerValue(rule.expression.minCount ?? 1);
  if (!isClauseKind(requiredClauseKind) || minCount === null || minCount < 1 || minCount > 200) {
    return finding(rule, facts, {
      status: 'unsupported',
      findingCode: 'required_clause.unsupported_expression',
      evidenceRefs: [],
    });
  }

  const matches = facts.clauses.filter((clause) => clause.clauseKind === requiredClauseKind);
  const status: RuleEvaluationStatus = matches.length >= minCount ? 'pass' : 'fail';
  return finding(rule, facts, {
    status,
    findingCode: `required_clause.${requiredClauseKind}.${status}`,
    clause: matches[0],
    evidenceRefs: matches.map((clause) => `clause:${clause.clauseId}`).slice(0, 20),
  });
}

function evaluateProhibitedTerm(
  rule: PlaybookRuleForEvaluation,
  facts: ContractRuleFacts,
): ContractRuleFinding {
  const normalizedTermKey = normalizeTermKey(
    stringValue(rule.expression.normalizedTermKey ?? rule.expression.termKey),
  );
  if (!normalizedTermKey) {
    return finding(rule, facts, {
      status: 'unsupported',
      findingCode: 'prohibited_term.unsupported_expression',
      evidenceRefs: [],
    });
  }

  const matches = facts.terms.filter((term) => term.normalizedTermKey === normalizedTermKey);
  const firstClause = matches[0]
    ? facts.clauses.find((clause) => clause.clauseId === matches[0]!.clauseId)
    : undefined;
  const status: RuleEvaluationStatus = matches.length > 0 ? 'fail' : 'pass';
  return finding(rule, facts, {
    status,
    findingCode: `prohibited_term.${status}`,
    clause: firstClause,
    evidenceRefs: matches.map((term) => `clause:${term.clauseId}`).slice(0, 20),
  });
}

function evaluateThreshold(
  rule: PlaybookRuleForEvaluation,
  facts: ContractRuleFacts,
): ContractRuleFinding {
  const metric = stringValue(rule.expression.metric);
  const operator = stringValue(rule.expression.operator);
  const value = integerValue(rule.expression.value);
  if (!thresholdMetrics.has(metric) || !thresholdOperators.has(operator) || value === null) {
    return finding(rule, facts, {
      status: 'unsupported',
      findingCode: 'threshold.unsupported_expression',
      evidenceRefs: [],
    });
  }

  const actual = metricValue(metric, facts);
  const passed =
    operator === 'eq' ? actual === value : operator === 'gte' ? actual >= value : actual <= value;
  const status: RuleEvaluationStatus = passed ? 'pass' : 'fail';
  return finding(rule, facts, {
    status,
    findingCode: `threshold.${metric}.${operator}.${status}`,
    clause: facts.clauses[0],
    evidenceRefs: facts.clauses.map((clause) => `clause:${clause.clauseId}`).slice(0, 20),
  });
}

function finding(
  rule: PlaybookRuleForEvaluation,
  facts: ContractRuleFacts,
  input: {
    status: RuleEvaluationStatus;
    findingCode: string;
    clause?: ContractRuleClauseFact | undefined;
    evidenceRefs: readonly string[];
  },
): ContractRuleFinding {
  const documentId = input.clause?.documentId ?? facts.documentId;
  const versionId = input.clause?.versionId ?? null;
  const clauseId = input.clause?.clauseId ?? null;
  const material = canonicalJson({
    matterId: facts.matterId,
    documentId,
    versionId,
    clauseId,
    ruleId: rule.ruleId,
    ruleKey: rule.ruleKey,
    ruleVersion: rule.versionNumber,
    expressionHash: rule.expressionHash,
    status: input.status,
    findingCode: input.findingCode,
    evidenceRefs: [...input.evidenceRefs].sort(),
  });
  const findingHash = sha256Hex(material);
  return {
    findingId: findingHash,
    matterId: facts.matterId,
    documentId,
    versionId,
    clauseId,
    ruleId: rule.ruleId,
    ruleKey: rule.ruleKey,
    ruleVersion: rule.versionNumber,
    severity: rule.severity,
    status: input.status,
    findingCode: input.findingCode,
    findingHash,
    evidenceRefs: [...new Set(input.evidenceRefs)].slice(0, 20),
  };
}

function metricValue(metric: string, facts: ContractRuleFacts): number {
  if (metric === 'clause_count') return facts.clauses.length;
  if (metric === 'defined_term_count') return facts.terms.length;
  if (metric === 'redline_change_count') return facts.redlineChanges.length;
  if (metric === 'defined_term_conflict_count') {
    const definitions = new Map<string, Set<string>>();
    for (const term of facts.terms) {
      const set = definitions.get(term.normalizedTermKey) ?? new Set<string>();
      set.add(term.definitionHash);
      definitions.set(term.normalizedTermKey, set);
    }
    return [...definitions.values()].filter((set) => set.size > 1).length;
  }
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function integerValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

function isClauseKind(value: string): value is ContractClauseKind {
  return clauseKinds.has(value as ContractClauseKind);
}

function normalizeTermKey(value: string): string | null {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return /^[a-z0-9 _.-]{1,120}$/.test(normalized) ? normalized : null;
}

function canonicalJson(input: unknown): string {
  return JSON.stringify(sortJson(input));
}

function sortJson(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sortJson);
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, sortJson(value)]),
    );
  }
  return input;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
