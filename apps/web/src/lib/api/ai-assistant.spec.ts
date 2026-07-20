import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiSummaryResponseDto } from '@amic-vault/shared';
import {
  aiAssistantErrorMessage,
  analyzeDocumentClauseRisks,
  askMatterQuestion,
  getAiAssistantSession,
  recordAiAssistantFeedback,
  summarizeEmailThread,
} from './ai-assistant';
import { ApiClientError, apiFetch } from '../api-client';

vi.mock('../api-client', async () => {
  const actual = await vi.importActual<typeof import('../api-client')>('../api-client');
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/ai/summaries') return summaryResponse();
      if (path.startsWith('/ai/sessions/')) return sessionResponse();
      if (path === '/ai/feedback') return feedbackResponse();
      return { path, init };
    }),
  };
});

describe('AI assistant API client', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  it('posts matter QA requests with same-matter filters and parses responses', async () => {
    const result = await askMatterQuestion({
      matterId: '11111111-1111-4111-8111-111111111001',
      query: '이 사건의 계약 상대방은?',
    });

    expect(result.task).toBe('matter_qa');
    expect(apiFetch).toHaveBeenCalledWith('/ai/summaries', {
      method: 'POST',
      redirectOnAuthRequired: false,
      body: JSON.stringify({
        matterId: '11111111-1111-4111-8111-111111111001',
        task: 'matter_qa',
        query: '이 사건의 계약 상대방은?',
        filters: { matterId: '11111111-1111-4111-8111-111111111001' },
        maxChunks: 8,
        locale: 'ko-KR',
      }),
    });
  });

  it('posts document clause risk analysis requests with target document scope', async () => {
    await analyzeDocumentClauseRisks({
      matterId: '11111111-1111-4111-8111-111111111001',
      documentId: '11111111-1111-4111-8111-111111111099',
    });

    expect(apiFetch).toHaveBeenCalledWith('/ai/summaries', {
      method: 'POST',
      redirectOnAuthRequired: false,
      body: JSON.stringify({
        matterId: '11111111-1111-4111-8111-111111111001',
        task: 'clause_analysis',
        query: '조항 리스크 분석',
        filters: { matterId: '11111111-1111-4111-8111-111111111001' },
        targetDocumentId: '11111111-1111-4111-8111-111111111099',
        maxChunks: 6,
        locale: 'ko-KR',
      }),
    });
  });

  it('posts email thread summary requests with target document scope', async () => {
    await summarizeEmailThread({
      matterId: '11111111-1111-4111-8111-111111111001',
      documentId: '11111111-1111-4111-8111-111111111099',
    });

    expect(apiFetch).toHaveBeenCalledWith('/ai/summaries', {
      method: 'POST',
      redirectOnAuthRequired: false,
      body: JSON.stringify({
        matterId: '11111111-1111-4111-8111-111111111001',
        task: 'email_thread_summary',
        query: '이메일 쓰레드 요청사항과 기한 요약',
        filters: { matterId: '11111111-1111-4111-8111-111111111001' },
        targetDocumentId: '11111111-1111-4111-8111-111111111099',
        maxChunks: 6,
        locale: 'ko-KR',
      }),
    });
  });

  it('loads session details and posts structured feedback', async () => {
    await expect(getAiAssistantSession('11111111-1111-4111-8111-111111111020')).resolves.toMatchObject({
      hiddenSourceCount: 2,
      chunks: expect.any(Array),
    });
    await recordAiAssistantFeedback({
      sessionId: '11111111-1111-4111-8111-111111111020',
      rating: 5,
      helpful: true,
      correctionType: 'none',
      errorTypes: [],
      editDistance: 0,
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/ai/sessions/11111111-1111-4111-8111-111111111020',
      { redirectOnAuthRequired: false },
    );
    expect(apiFetch).toHaveBeenCalledWith('/ai/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: '11111111-1111-4111-8111-111111111020',
        rating: 5,
        helpful: true,
        correctionType: 'none',
        errorTypes: [],
        editDistance: 0,
      }),
    });
  });

  it('maps AI policy blocks to a safe user message', () => {
    expect(aiAssistantErrorMessage(new ApiClientError(403, { code: 'AI_POLICY_BLOCKED' }))).toBe(
      'AI 정책상 이 질문은 처리할 수 없습니다.',
    );
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

function sessionResponse() {
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

function feedbackResponse() {
  return {
    feedbackId: '11111111-1111-4111-8111-111111111040',
    sessionId: '11111111-1111-4111-8111-111111111020',
    matterId: '11111111-1111-4111-8111-111111111001',
    recordedByUserId: '11111111-1111-4111-8111-111111111030',
    rating: 5,
    helpful: true,
    correctionType: 'none',
    errorTypes: [],
    editDistance: 0,
    createdAt: '2026-06-15T00:00:02.000Z',
  };
}
