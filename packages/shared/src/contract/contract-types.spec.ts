import { describe, expect, it } from 'vitest';
import {
  clauseBankEntryListResponseSchema,
  clauseSearchRequestSchema,
  clauseSearchResponseSchema,
  contractAiReviewFindingListResponseSchema,
  contractClauseBankResponseSchema,
  contractClassificationSchema,
  contractProcessRequestSchema,
  contractRuleFindingsResponseSchema,
  counterpartyPatternsResponseSchema,
  createClauseBankEntryRequestSchema,
  createNegotiationPositionRequestSchema,
  createPlaybookRuleRequestSchema,
  negotiationIssueListResponseSchema,
  updateNegotiationIssueStatusRequestSchema,
  negotiationPositionSchema,
  updateClauseBankEntryRequestSchema,
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

  it('accepts client-scoped playbook rules and rejects ambiguous scopes', () => {
    const clientId = '11111111-1111-4111-8111-111111111111';
    const matterId = '22222222-2222-4222-8222-222222222222';
    expect(
      createPlaybookRuleRequestSchema.parse({
        ruleKey: 'client.nda.indemnity',
        ruleType: 'required_clause',
        severity: 'critical',
        clientId,
      }),
    ).toMatchObject({ clientId });
    expect(() =>
      createPlaybookRuleRequestSchema.parse({
        ruleKey: 'ambiguous.nda.indemnity',
        ruleType: 'required_clause',
        severity: 'critical',
        clientId,
        matterId,
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

  it('requires citations for contract AI review findings', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);
    const response = contractAiReviewFindingListResponseSchema.parse({
      matterId: uuid,
      documentId: uuid,
      findings: [
        {
          findingId: uuid,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseId: null,
          aiSessionId: uuid,
          aiClaimId: uuid,
          aiSource: 'local_gemma',
          task: 'clause_analysis',
          severity: 'warning',
          findingCode: 'contract.ai.clause_analysis.warning',
          findingHash: hash,
          findingText: '조항 검토 의견은 citation 기반 claim으로만 표시된다.',
          citationRefs: [`chunk:${uuid}`],
          status: 'pending',
          acceptedBy: null,
          acceptedAt: null,
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
    });

    const finding = response.findings[0]!;
    expect(finding.citationRefs).toEqual([`chunk:${uuid}`]);
    expect(() =>
      contractAiReviewFindingListResponseSchema.parse({
        ...response,
        findings: [{ ...finding, citationRefs: [] }],
      }),
    ).toThrow();
    expect(JSON.stringify(response)).not.toContain('raw clause body');
  });

  it('accepts firm clause bank approval entries without source text', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);

    expect(createClauseBankEntryRequestSchema.parse({ clauseId: uuid, tags: ['nda'] })).toEqual({
      clauseId: uuid,
      tags: ['nda'],
    });
    expect(updateClauseBankEntryRequestSchema.parse({ status: 'approved' })).toEqual({
      status: 'approved',
    });
    const entries = clauseBankEntryListResponseSchema.parse({
      entries: [
        {
          entryId: uuid,
          status: 'approved',
          sourceClauseId: uuid,
          matterId: null,
          documentId: null,
          versionId: null,
          clauseKind: 'section',
          clauseNumber: '2',
          headingHash: hash,
          textHash: hash,
          tags: ['nda'],
          usageCount: 0,
          proposedBy: uuid,
          approvedBy: uuid,
          sourceAccessible: false,
          citationRef: `clause-bank:${uuid}`,
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
    });

    expect(entries.entries[0]?.sourceAccessible).toBe(false);
    expect(JSON.stringify(entries)).not.toContain('Confidential Information means');
    expect(JSON.stringify(entries)).not.toContain('raw clause body');
  });

  it('accepts reference-only similar clause search results', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);

    expect(clauseSearchRequestSchema.parse({ query: '손해배상 책임 상한', limit: '5' })).toEqual({
      query: '손해배상 책임 상한',
      limit: 5,
    });
    const response = clauseSearchResponseSchema.parse({
      queryHash: hash,
      modelRoute: 'bge_m3',
      results: [
        {
          clauseId: uuid,
          clauseBankEntryId: uuid,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseKind: 'section',
          clauseNumber: '7',
          headingHash: hash,
          textHash: hash,
          tags: ['liability_cap'],
          approved: true,
          score: 1.08,
          semanticScore: 1,
          citationRef: `clause:${uuid}`,
        },
      ],
    });

    expect(response.results[0]?.approved).toBe(true);
    expect(JSON.stringify(response)).not.toContain('Confidential Information means');
    expect(JSON.stringify(response)).not.toContain('raw clause body');
  });

  it('accepts negotiation positions and counterparty patterns as bounded structured data', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';

    const request = createNegotiationPositionRequestSchema.parse({
      matterId: uuid,
      partyId: uuid,
      issueLabel: '손해배상',
      clauseKind: 'indemnity',
      positionSummary: '상대방은 간접손해 제외를 요구했다.',
      sourceDocumentId: uuid,
      sourceVersionId: uuid,
      sourceClauseId: uuid,
      roundNo: 2,
    });
    expect(request.clauseKind).toBe('indemnity');

    const position = negotiationPositionSchema.parse({
      positionId: uuid,
      matterId: uuid,
      partyId: uuid,
      issueLabel: request.issueLabel,
      clauseKind: request.clauseKind,
      positionSummary: request.positionSummary,
      sourceDocumentId: uuid,
      sourceVersionId: uuid,
      sourceClauseId: uuid,
      roundNo: 2,
      createdBy: uuid,
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    });
    const patterns = counterpartyPatternsResponseSchema.parse({
      partyId: uuid,
      patterns: [
        {
          partyId: uuid,
          clauseKind: 'indemnity',
          requestCount: 2,
          matterCount: 1,
          latestRoundNo: 2,
          latestPositionId: uuid,
        },
      ],
    });

    expect(patterns.patterns[0]?.requestCount).toBe(2);
    expect(JSON.stringify({ position, patterns })).not.toContain('raw clause body');
  });

  it('accepts negotiation issues as bounded redline and finding references', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);

    const response = negotiationIssueListResponseSchema.parse({
      matterId: uuid,
      documentId: uuid,
      issues: [
        {
          issueId: uuid,
          matterId: uuid,
          documentId: uuid,
          versionId: uuid,
          clauseId: uuid,
          redlineChangeId: uuid,
          changeType: 'added',
          redlineTextHash: hash,
          ruleId: uuid,
          ruleKey: 'nda.redline.threshold',
          ruleVersion: 1,
          severity: 'warning',
          findingStatus: 'pass',
          findingCode: 'threshold.redline_change_count.gte.pass',
          findingHash: hash,
          status: 'open',
          citationRefs: [`redline:${uuid}`, `clause:${uuid}`],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
    });

    expect(response.issues[0]?.status).toBe('open');
    expect(updateNegotiationIssueStatusRequestSchema.parse({ status: 'agreed' })).toEqual({
      status: 'agreed',
    });
    expect(JSON.stringify(response)).not.toContain('raw clause body');
  });
});
