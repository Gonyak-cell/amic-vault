#!/usr/bin/env node
import { createRequire } from 'node:module';

type ContractClauseKind = 'article' | 'section' | 'paragraph' | 'definition';
type PlaybookRuleType = 'required_clause' | 'prohibited_term' | 'threshold';
type PlaybookRuleSeverity = 'info' | 'warning' | 'critical';

interface ParsedClause {
  clauseKind: ContractClauseKind;
  clauseNumber: string;
  textHash: string;
}

interface ParsedDefinedTerm {
  normalizedTermKey: string;
  definitionHash: string;
}

interface ParsedRedlineChange {
  changeType: 'added' | 'deleted';
  textHash: string;
}

interface ContractParseResult {
  status: 'success' | 'partial' | 'failed';
  clauses: ParsedClause[];
  definedTerms: ParsedDefinedTerm[];
  redlineChanges: ParsedRedlineChange[];
}

interface ContractRuleClauseFact {
  clauseId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseKind: ContractClauseKind;
  clauseNumber: string;
  textHash: string;
}

interface ContractRuleTermFact {
  termId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseId: string;
  normalizedTermKey: string;
  definitionHash: string;
}

interface ContractRuleRedlineFact {
  redlineChangeId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  clauseId: string | null;
  changeType: 'added' | 'deleted';
  textHash: string;
}

interface ContractRuleFacts {
  matterId: string;
  documentId: string | null;
  clauses: ContractRuleClauseFact[];
  terms: ContractRuleTermFact[];
  redlineChanges: ContractRuleRedlineFact[];
}

interface PlaybookRuleForEvaluation {
  ruleId: string;
  ruleKey: string;
  ruleType: PlaybookRuleType;
  severity: PlaybookRuleSeverity;
  versionNumber: number;
  matterId: string | null;
  expressionHash: string;
  expression: Record<string, unknown>;
}

interface ContractRuleFinding {
  status: 'pass' | 'fail' | 'unsupported';
  findingHash: string;
}

interface ContractParserModule {
  parseContractText(text: string): ContractParseResult;
}

interface ContractRuleEngineModule {
  evaluatePlaybookRule(
    rule: PlaybookRuleForEvaluation,
    facts: ContractRuleFacts,
  ): ContractRuleFinding;
}

const requireFromHere = createRequire(import.meta.url);
const { parseContractText } = requireFromHere(
  '../../apps/api/dist/modules/contract-intel/contract-parser.js',
) as ContractParserModule;
const { evaluatePlaybookRule } = requireFromHere(
  '../../apps/api/dist/modules/contract-intel/contract-rule-engine.js',
) as ContractRuleEngineModule;

const matterId = '11111111-1111-4111-8111-111111111001';
const documentId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const hash = 'a'.repeat(64);

const fixture = `Article 1 Definitions
"Confidential Information" means all non-public information

Section 2 Confidentiality
The receiving party shall protect Confidential Information. [[ADD:reasonable safeguards]]`;

const parsed = parseContractText(fixture);
const malformed = 'Section 1 Review\n[[ADD:unterminated redline marker';
const malformedBefore = malformed.slice();
const malformedParsed = parseContractText(malformed);

const facts: ContractRuleFacts = {
  matterId,
  documentId,
  clauses: parsed.clauses.map((clause, index) => ({
    clauseId: `11111111-1111-4111-8111-11111111110${index + 4}`,
    matterId,
    documentId,
    versionId,
    clauseKind: clause.clauseKind,
    clauseNumber: clause.clauseNumber,
    textHash: clause.textHash,
  })),
  terms: parsed.definedTerms.map((term, index) => ({
    termId: `11111111-1111-4111-8111-11111111120${index + 1}`,
    matterId,
    documentId,
    versionId,
    clauseId: '11111111-1111-4111-8111-111111111104',
    normalizedTermKey: term.normalizedTermKey,
    definitionHash: term.definitionHash,
  })),
  redlineChanges: parsed.redlineChanges.map((change, index) => ({
    redlineChangeId: `11111111-1111-4111-8111-11111111130${index + 1}`,
    matterId,
    documentId,
    versionId,
    clauseId: '11111111-1111-4111-8111-111111111105',
    changeType: change.changeType,
    textHash: change.textHash,
  })),
};

const requiredRule = rule({
  ruleKey: 'nda.section.required',
  ruleType: 'required_clause',
  expression: { requiredClauseKind: 'section', minCount: 1 },
});
const firstFinding = evaluatePlaybookRule(requiredRule, facts);
const secondFinding = evaluatePlaybookRule(requiredRule, facts);
const unsupportedFinding = evaluatePlaybookRule(
  rule({
    ruleKey: 'nda.unsupported.metric',
    ruleType: 'threshold',
    expression: { metric: 'raw_body', operator: 'gte', value: 1 },
  }),
  facts,
);

const report = {
  clauseEvalCaseCount: 1,
  expectedClauseCount: 2,
  observedClauseCount: parsed.clauses.length,
  clauseExtractionAccuracy: parsed.clauses.length === 2 ? 1 : 0,
  parserSafetyPass:
    malformedParsed.status === 'partial' &&
    malformedParsed.redlineChanges.length === 0 &&
    malformed === malformedBefore,
  ruleReproducibilityPass: JSON.stringify(firstFinding) === JSON.stringify(secondFinding),
  unsupportedRulePass: unsupportedFinding.status === 'unsupported',
  ruleFindingStatus: firstFinding.status,
  ruleFindingHash: firstFinding.findingHash,
  technicalPass:
    parsed.clauses.length === 2 &&
    malformedParsed.status === 'partial' &&
    JSON.stringify(firstFinding) === JSON.stringify(secondFinding) &&
    unsupportedFinding.status === 'unsupported',
  warnings: [
    'R8 contract eval uses committed technical fixtures; operational clause-bank corpus expansion remains future work.',
  ],
};

console.log(JSON.stringify(report, null, 2));

function rule(input: Partial<PlaybookRuleForEvaluation>): PlaybookRuleForEvaluation {
  return {
    ruleId: '11111111-1111-4111-8111-111111111401',
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
