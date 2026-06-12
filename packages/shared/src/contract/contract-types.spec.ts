import { describe, expect, it } from 'vitest';
import {
  contractClassificationSchema,
  contractProcessRequestSchema,
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
});
