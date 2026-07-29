import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  ContractAiReviewFindingDto,
  ContractClauseBankItemDto,
  ContractRuleFindingDto,
  DocumentDto,
  NegotiationIssueDto,
} from '@amic-vault/shared';
import { ContractMatterReadOnlyView } from '@/components/matter/matter-workstream-readonly';

const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111223';
const versionId = '11111111-1111-4111-8111-111111111224';
const clauseId = '11111111-1111-4111-8111-111111111225';
const ruleId = '11111111-1111-4111-8111-111111111226';
const aiFindingId = '11111111-1111-4111-8111-111111111233';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const baseDocument = {
  documentId,
  tenantId: '11111111-1111-4111-8111-111111111220',
  matterId,
  matterDisplayCode: 'AMIC-2026-1001',
  matterDisplayName: '계약 검토',
  documentFamilyId: '11111111-1111-4111-8111-111111111229',
  title: 'Draft Agreement',
  status: 'counterparty_sent',
  documentType: 'contract',
  subtype: null,
  confidentialityLevel: 'standard',
  privilegeStatus: 'none',
  source: 'internal_work_product',
  aiAllowed: false,
  legalHold: false,
  tags: [],
  createdBy: '11111111-1111-4111-8111-111111111230',
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies DocumentDto;

const finalDocument = {
  ...baseDocument,
  documentId: '11111111-1111-4111-8111-111111111231',
  documentFamilyId: '11111111-1111-4111-8111-111111111232',
  title: 'Final Agreement',
  status: 'final',
} satisfies DocumentDto;

const finding = {
  findingId: hashA,
  matterId,
  documentId,
  versionId,
  clauseId,
  ruleId,
  ruleKey: 'governing_law',
  ruleVersion: 3,
  severity: 'critical',
  status: 'fail',
  findingCode: 'rule.finding.missing_governing_law',
  findingHash: hashB,
  evidenceRefs: ['clause:governing_law'],
} satisfies ContractRuleFindingDto;

const aiFinding = {
  findingId: aiFindingId,
  matterId,
  documentId,
  versionId,
  clauseId,
  aiSessionId: '11111111-1111-4111-8111-111111111234',
  aiClaimId: '11111111-1111-4111-8111-111111111235',
  aiSource: 'local_gemma',
  task: 'clause_analysis',
  severity: 'warning',
  findingCode: 'ai.contract.clause.governing_law_gap',
  findingHash: hashA,
  findingText: '준거법 조항의 적용 범위가 문서 내 인용 조항 기준으로 불명확합니다.',
  citationRefs: ['claim:11111111-1111-4111-8111-111111111235', 'clause:governing_law'],
  status: 'pending',
  acceptedBy: null,
  acceptedAt: null,
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies ContractAiReviewFindingDto;

const clause = {
  clauseId,
  matterId,
  documentId,
  versionId,
  clauseKind: 'section',
  clauseNumber: '12.3',
  startOffset: 120,
  endOffset: 240,
  headingHash: hashA,
  textHash: hashB,
  definedTermCount: 2,
  conflictCount: 1,
  redlineChangeCount: 0,
  citationRef: 'clause:governing_law',
} satisfies ContractClauseBankItemDto;

const negotiationIssue = {
  issueId: '11111111-1111-4111-8111-111111111227',
  matterId,
  documentId,
  versionId,
  clauseId,
  redlineChangeId: '11111111-1111-4111-8111-111111111228',
  changeType: 'added',
  redlineTextHash: hashA,
  ruleId,
  ruleKey: 'governing_law',
  ruleVersion: 3,
  severity: 'critical',
  findingStatus: 'fail',
  findingCode: 'rule.finding.missing_governing_law',
  findingHash: hashB,
  status: 'open',
  citationRefs: ['redline:11111111-1111-4111-8111-111111111228', 'clause:governing_law'],
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies NegotiationIssueDto;

describe('Matter contracts read-only page', () => {
  it('renders contract rule findings and clause bank rows', () => {
    const html = renderToStaticMarkup(
      <ContractMatterReadOnlyView
        data={{
          clauses: [clause],
          aiReviewFindings: [aiFinding],
          documents: [baseDocument, finalDocument],
          findings: [finding],
          issues: [negotiationIssue],
          unsupportedRuleCount: 0,
        }}
      />,
    );

    expect(html).toContain('규칙 검토 결과');
    expect(html).toContain('rule.finding.missing_governing_law');
    expect(html).toContain('governing_law');
    expect(html).toContain('계약 1차 검토');
    expect(html).toContain('기준 위반');
    expect(html).toContain('AI 소견');
    expect(html).toContain('ai.contract.clause.governing_law_gap');
    expect(html).toContain('준거법 조항의 적용 범위');
    expect(html).toContain('참조 ••••11111235');
    expect(html).not.toContain('claim:11111111-1111-4111-8111-111111111235');
    expect(html).toContain('검토 완료');
    expect(html).toContain('계약 진행');
    expect(html).toContain('Draft Agreement');
    expect(html).toContain('마크업 수령');
    expect(html).toContain('Final Agreement');
    expect(html).toContain('체결');
    expect(html).toContain('협상 쟁점표');
    expect(html).toContain('검토 중');
    expect(html).toContain('조항 라이브러리');
    expect(html).toContain('12.3');
  });
});
