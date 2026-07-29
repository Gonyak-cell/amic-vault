import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ContractAiReviewFindingDto, ContractRuleFindingDto } from '@amic-vault/shared';
import { ContractAiReviewPanel } from './contract-ai-review-panel';

const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111223';
const versionId = '11111111-1111-4111-8111-111111111224';
const clauseId = '11111111-1111-4111-8111-111111111225';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const ruleFinding = {
  findingId: hashA,
  matterId,
  documentId,
  versionId,
  clauseId,
  ruleId: '11111111-1111-4111-8111-111111111226',
  ruleKey: 'governing_law',
  ruleVersion: 3,
  severity: 'critical',
  status: 'fail',
  findingCode: 'rule.finding.missing_governing_law',
  findingHash: hashB,
  evidenceRefs: ['clause:governing_law'],
} satisfies ContractRuleFindingDto;

const aiFinding = {
  findingId: '11111111-1111-4111-8111-111111111233',
  matterId,
  documentId,
  versionId,
  clauseId,
  aiSessionId: '11111111-1111-4111-8111-111111111234',
  aiClaimId: '11111111-1111-4111-8111-111111111235',
  aiSource: 'local_gemma',
  task: 'risk_extraction',
  severity: 'warning',
  findingCode: 'ai.contract.risk.indemnity_scope',
  findingHash: hashA,
  findingText: '손해배상 범위가 상대방 초안의 면책 문구와 충돌할 가능성이 있습니다.',
  citationRefs: ['claim:11111111-1111-4111-8111-111111111235', 'clause:governing_law'],
  status: 'pending',
  acceptedBy: null,
  acceptedAt: null,
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies ContractAiReviewFindingDto;

describe('ContractAiReviewPanel', () => {
  it('renders rule violations beside cited AI opinions with the lawyer acceptance control', () => {
    const html = renderToStaticMarkup(
      <ContractAiReviewPanel
        aiReviewFindings={[aiFinding]}
        onAcceptFinding={() => undefined}
        ruleFindings={[ruleFinding]}
      />,
    );

    expect(html).toContain('계약 1차 검토');
    expect(html).toContain('기준 위반');
    expect(html).toContain('rule.finding.missing_governing_law');
    expect(html).toContain('AI 소견');
    expect(html).toContain('리스크 추출');
    expect(html).toContain('ai.contract.risk.indemnity_scope');
    expect(html).toContain('손해배상 범위가 상대방 초안');
    expect(html).toContain('참조 ••••11111235');
    expect(html).not.toContain('claim:11111111-1111-4111-8111-111111111235');
    expect(html).toContain('검토 완료');
    expect(html).not.toContain('disabled=""');
  });

  it('renders empty states when there are no rule or AI findings', () => {
    const html = renderToStaticMarkup(
      <ContractAiReviewPanel aiReviewFindings={[]} ruleFindings={[]} />,
    );

    expect(html).toContain('표시할 기준 위반이 없습니다.');
    expect(html).toContain('AI 소견이 없습니다.');
  });
});
