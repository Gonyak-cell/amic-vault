import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiSessionDetailDto, AiSummaryResponseDto } from '@amic-vault/shared';
import { AiAssistantPanel } from './ai-assistant-panel';

describe('AiAssistantPanel', () => {
  it('renders cited answers, document links, review badges, and hidden source counts', () => {
    const html = renderToStaticMarkup(
      <AiAssistantPanel
        matterId="11111111-1111-4111-8111-111111111001"
        initialQuery="이 사건의 계약 상대방은?"
        initialResponse={summaryResponse()}
        initialSessionDetail={sessionDetail()}
      />,
    );

    expect(html).toContain('Matter AI 질의');
    expect(html).toContain('결론');
    expect(html).toContain('불확실한 부분');
    expect(html).toContain('추가 확인 자료');
    expect(html).toContain('권장 조치');
    expect(html).toContain('계약 상대방은 AMIC Holdings입니다.');
    expect(html).toContain('최신 송부본을 확인해야 합니다.');
    expect(html).toContain('권한 또는 컨텍스트 제한으로 제외된 자료 2건');
    expect(html).toContain('담당 변호사가 답변을 검토합니다.');
    expect(html).toContain('검토 필요');
    expect(html).toContain('변호사 검토 필요');
    expect(html).toContain(
      '/documents/11111111-1111-4111-8111-111111111023?chunk=1',
    );
    expect(html).toContain('검색·인용·제외 내역');
    expect(html).toContain('권한 제한으로 숨김');
    expect(html).toContain('2건');
    expect(html).toContain('권한 제한');
    expect(html).not.toMatch(/prompt|raw source|model response|sourceText|quoteHash/i);
  });
});

function summaryResponse(): AiSummaryResponseDto {
  return {
    sessionId: '11111111-1111-4111-8111-111111111020',
    matterId: '11111111-1111-4111-8111-111111111001',
    task: 'matter_qa',
    status: 'escalated',
    modelRoute: 'local_gemma',
    evidencePackId: '11111111-1111-4111-8111-111111111021',
    conclusion: '계약 상대방은 AMIC Holdings입니다.',
    openQuestions: [
      {
        question: '최신 송부본이 반영됐는지는 확정할 수 없습니다.',
        neededEvidence: '최신 송부본을 확인해야 합니다.',
      },
    ],
    recommendedActions: [
      {
        action: '담당 변호사가 답변을 검토합니다.',
        reviewRequired: true,
      },
    ],
    excludedSourcesNotice: { count: 2 },
    citations: [
      {
        citationRef: 'chunk:11111111-1111-4111-8111-111111111022',
        matterId: '11111111-1111-4111-8111-111111111001',
        documentId: '11111111-1111-4111-8111-111111111023',
        versionId: '11111111-1111-4111-8111-111111111024',
        chunkId: '11111111-1111-4111-8111-111111111022',
        quoteHash: 'a'.repeat(64),
        sourceTextHash: 'b'.repeat(64),
      },
    ],
    claims: [
      {
        claimId: 'claim-1',
        claimHash: 'c'.repeat(64),
        citationRefs: ['chunk:11111111-1111-4111-8111-111111111022'],
        isLegalConclusion: true,
      },
    ],
    sections: [
      {
        sectionId: 'answer',
        heading: '계약 상대방',
        text: '계약 상대방은 AMIC Holdings입니다.',
        citationRefs: ['chunk:11111111-1111-4111-8111-111111111022'],
        escalationRequired: true,
      },
    ],
    warnings: ['HUMAN_REVIEW_REQUIRED', 'NO_DENIED_SOURCES_INCLUDED'],
    citationWarnings: [
      {
        code: 'LEGAL_CONCLUSION_REQUIRES_REVIEW',
        claimId: 'claim-1',
        citationRef: 'chunk:11111111-1111-4111-8111-111111111022',
        escalationRequired: true,
      },
    ],
    escalationRequired: true,
    legalConclusionAutoApproval: false,
  };
}

function sessionDetail(): AiSessionDetailDto {
  return {
    sessionId: '11111111-1111-4111-8111-111111111020',
    matterId: '11111111-1111-4111-8111-111111111001',
    ownerUserId: '11111111-1111-4111-8111-111111111030',
    authSessionId: null,
    modelRoute: 'local_gemma',
    status: 'responded',
    promptHash: 'd'.repeat(64),
    promptLength: 18,
    responseHash: 'e'.repeat(64),
    responseLength: 21,
    responseTokenCount: 32,
    latencyMs: 1200,
    escalationRequired: true,
    blockedReason: null,
    chunks: [
      {
        documentId: '11111111-1111-4111-8111-111111111023',
        versionId: '11111111-1111-4111-8111-111111111024',
        chunkId: '11111111-1111-4111-8111-111111111022',
        included: true,
        reasonCode: 'included',
        rankIndex: 0,
        score: 0.92,
        quoteHash: 'a'.repeat(64),
        sourceTextHash: 'b'.repeat(64),
      },
      {
        documentId: '11111111-1111-4111-8111-111111111025',
        versionId: '11111111-1111-4111-8111-111111111026',
        chunkId: '11111111-1111-4111-8111-111111111027',
        included: false,
        reasonCode: 'permission_denied',
        rankIndex: 1,
        score: 0.4,
        quoteHash: 'f'.repeat(64),
        sourceTextHash: '0'.repeat(64),
      },
    ],
    hiddenSourceCount: 2,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}
