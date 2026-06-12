import { describe, expect, it, vi } from 'vitest';
import {
  createContractPlaybookRule,
  listContractClauseBank,
  listContractRuleFindings,
  processContractDocument,
} from './contract-intel';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string) => ({ path })),
}));

describe('contract intelligence API client', () => {
  it('uses scoped contract-intel endpoints', async () => {
    await expect(
      processContractDocument({ documentId: '11111111-1111-4111-8111-111111111111' }),
    ).resolves.toEqual({ path: '/contract-intel/process' });
    await expect(
      listContractClauseBank({
        matterId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
        limit: 50,
      }),
    ).resolves.toEqual({
      path: '/contract-intel/clause-bank?matterId=11111111-1111-4111-8111-111111111111&documentId=22222222-2222-4222-8222-222222222222&limit=50',
    });
    await expect(
      listContractRuleFindings({
        matterId: '11111111-1111-4111-8111-111111111111',
        limit: 20,
      }),
    ).resolves.toEqual({
      path: '/contract-intel/rule-findings?matterId=11111111-1111-4111-8111-111111111111&limit=20',
    });
    await expect(
      createContractPlaybookRule({
        ruleKey: 'nda.section.required',
        ruleType: 'required_clause',
        severity: 'critical',
        expression: { requiredClauseKind: 'section', minCount: 1 },
        matterId: null,
      }),
    ).resolves.toEqual({ path: '/contract-intel/playbook-rules' });
  });
});
