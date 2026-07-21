import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiSummaryResponseDto } from '@amic-vault/shared';
import { AiAnswerPanel, citationDocumentUrl } from './ai-answer-panel';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('AiAnswerPanel', () => {
  it('renders a seeded answer with citation cards and document deep links', () => {
    const html = renderToStaticMarkup(
      <AiAnswerPanel
        seedQuery="작년 X사 계약의 해지 조항 요약해줘"
        matterId="11111111-1111-4111-8111-111111111001"
        matterLabel="AMIC-2026-0007 · Vault Upgrade"
        initialResponse={summaryResponse()}
      />,
    );

    expect(html).toContain('AI에게 질문');
    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).toContain('작년 X사 계약의 해지 조항 요약해줘');
    expect(html).toContain('계약 해지 조항은 30일 전 통지가 필요합니다.');
    expect(html).toContain('인용 문서');
    expect(html).toContain('/documents/11111111-1111-4111-8111-111111111023?chunk=1');
    expect(html).not.toMatch(/prompt|raw source|sourceText|quoteHash/i);
  });

  it('renders fail-closed guidance for blocked or missing matter context', () => {
    const blockedHtml = renderToStaticMarkup(
      <AiAnswerPanel
        seedQuery="해지 조항 요약"
        matterId="11111111-1111-4111-8111-111111111001"
        initialError="AI 정책상 이 질문은 처리할 수 없습니다."
      />,
    );
    const noMatterHtml = renderToStaticMarkup(<AiAnswerPanel seedQuery="해지 조항 요약" />);

    expect(blockedHtml).toContain('AI 정책상 이 질문은 처리할 수 없습니다.');
    expect(noMatterHtml).toContain('Matter 하나를 필터로 선택하거나 단일 Matter 결과에서 실행하세요.');
  });

  it('builds citation document URLs without exposing citation hashes', () => {
    expect(
      citationDocumentUrl({
        ordinal: 2,
        citation: summaryResponse().citations[0]!,
      }),
    ).toBe('/documents/11111111-1111-4111-8111-111111111023?chunk=2');
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
    conclusion: '계약 해지 조항은 30일 전 통지가 필요합니다.',
    openQuestions: [],
    recommendedActions: [
      {
        action: '담당 변호사가 답변을 검토합니다.',
        reviewRequired: true,
      },
    ],
    excludedSourcesNotice: { count: 0 },
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
        heading: '해지 조항',
        text: '계약 해지 조항은 30일 전 통지가 필요합니다.',
        citationRefs: ['chunk:11111111-1111-4111-8111-111111111022'],
        escalationRequired: true,
      },
    ],
    warnings: ['HUMAN_REVIEW_REQUIRED'],
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
