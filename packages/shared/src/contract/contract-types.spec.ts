import { describe, expect, it } from 'vitest';
import {
  contractClauseBankResponseSchema,
  contractClassificationSchema,
  contractProcessRequestSchema,
  contractRuleFindingsResponseSchema,
  createPlaybookRuleRequestSchema,
} from './contract-types';

describe('contract shared schemas', () => {
  it('accepts bounded contract process requests', () => {
    expect(() =>
      contractProcessRequestSchema.parse({
        documentId: '11111111-1111-4111-8111-111111111111',
      }),
    ).not.toThrow();
  });

  it('keeps classification output reference and signal based', () => {
    const parsed = contractClassificationSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      matterId: '33333333-3333-4333-8333-333333333333',
      contractType: 'nda',
      confidence: 0.82,
      classifierVersion: 'r8-local-v1',
      unsupported: false,
      signalRefs: ['keyword:non-disclosure'],
    });
    expect(parsed.signalRefs).toEqual(['keyword:non-disclosure']);
  });

  it('rejects unsafe playbook keys', () => {
    expect(() =>
      createPlaybookRuleRequestSchema.parse({
        ruleKey: '../escape',
        ruleType: 'required_clause',
        severity: 'warning',
      }),
    ).toThrow();
  });

  it('accepts reference-only clause bank and rule finding responses', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);
    const clauseBank = contractClauseBankResponseSchema.parse({
      matterId: uuid,
      documentId: uuid,
      clauses: [
        {
          clauseId: uuid,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseKind: 'section',
          clauseNumber: '2',
          startOffset: 10,
          endOffset: 20,
          headingHash: hash,
          textHash: hash,
          definedTermCount: 1,
          conflictCount: 0,
          redlineChangeCount: 1,
          citationRef: `clause:${uuid}`,
        },
      ],
    });
    const findings = contractRuleFindingsResponseSchema.parse({
      matterId: uuid,
      documentId: uuid,
      unsupportedRuleCount: 0,
      findings: [
        {
          findingId: hash,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseId: uuid,
          ruleId: uuid,
          ruleKey: 'nda.section.required',
          ruleVersion: 1,
          severity: 'critical',
          status: 'pass',
          findingCode: 'required_clause.section.pass',
          findingHash: hash,
          evidenceRefs: [`clause:${uuid}`],
        },
      ],
    });
    const serialized = JSON.stringify({ clauseBank, findings });
    expect(serialized).not.toContain('Confidential Information means');
    expect(serialized).not.toContain('raw clause body');
    expect(serialized).not.toContain('snippet leakage');
  });
});
