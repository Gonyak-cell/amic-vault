import { describe, expect, it, vi } from 'vitest';
import {
  acceptContractAiReviewFinding,
  createClauseBankEntry,
  createContractPlaybookRule,
  listClauseBankEntries,
  listContractAiReviewFindings,
  listContractClauseBank,
  listContractRuleFindings,
  listNegotiationIssues,
  processContractDocument,
  prepareWordClauseInsertion,
  searchSimilarClauses,
  updateClauseBankEntry,
  updateNegotiationIssueStatus,
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
      listContractAiReviewFindings({
        matterId: '11111111-1111-4111-8111-111111111111',
        task: 'clause_analysis',
        status: 'pending',
        limit: 25,
      }),
    ).resolves.toEqual({
      path: '/contract-intel/ai-review-findings?matterId=11111111-1111-4111-8111-111111111111&task=clause_analysis&status=pending&limit=25',
    });
    await expect(
      acceptContractAiReviewFinding('11111111-1111-4111-8111-111111111555'),
    ).resolves.toEqual({
      path: '/contract-intel/ai-review-findings/11111111-1111-4111-8111-111111111555/accept',
    });
    await expect(
      listNegotiationIssues({
        matterId: '11111111-1111-4111-8111-111111111111',
        status: 'open',
        limit: 50,
      }),
    ).resolves.toEqual({
      path: '/contract-intel/negotiation-issues?matterId=11111111-1111-4111-8111-111111111111&status=open&limit=50',
    });
    await expect(
      updateNegotiationIssueStatus('11111111-1111-4111-8111-111111111444', {
        status: 'agreed',
      }),
    ).resolves.toEqual({
      path: '/contract-intel/negotiation-issues/11111111-1111-4111-8111-111111111444',
    });
    await expect(
      listClauseBankEntries({ status: 'approved', tag: 'nda', limit: 25 }),
    ).resolves.toEqual({
      path: '/contract-intel/clause-bank/entries?status=approved&tag=nda&limit=25',
    });
    await expect(
      createClauseBankEntry({
        clauseId: '11111111-1111-4111-8111-111111111333',
        tags: ['nda'],
      }),
    ).resolves.toEqual({ path: '/contract-intel/clause-bank/entries' });
    await expect(
      updateClauseBankEntry('11111111-1111-4111-8111-111111111333', {
        status: 'approved',
      }),
    ).resolves.toEqual({
      path: '/contract-intel/clause-bank/entries/11111111-1111-4111-8111-111111111333',
    });
    await expect(searchSimilarClauses({ query: '손해배상 책임 상한', limit: 10 })).resolves.toEqual({
      path: '/contract-intel/clause-search',
    });
    await expect(
      prepareWordClauseInsertion({
        clauseId: '11111111-1111-4111-8111-111111111333',
        clauseBankEntryId: '22222222-2222-4222-8222-222222222333',
        insertionFormat: 'ooxml',
        sourceClient: 'word-web-addin',
      }),
    ).resolves.toEqual({ path: '/contract-intel/word-addin/clause-insertions' });
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
