import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiPrepMatterReadinessDto } from '@amic-vault/shared';
import { AiPrepMatterDashboard } from './ai-prep-matter-dashboard';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

describe('AiPrepMatterDashboard', () => {
  it('renders matter readiness counts and retry control', () => {
    const html = renderToStaticMarkup(<AiPrepMatterDashboard readiness={readiness()} />);

    expect(html).toContain('파일 정리 상태');
    expect(html).toContain('Matter 파일 정리 목록');
    expect(html).toContain('정리됨');
    expect(html).toContain('추가 확인');
    expect(html).toContain('Contract.pdf');
    expect(html).toContain('일부 정리됨');
    expect(html).toContain('파일 정리 다시 실행');
    expect(html).toContain('Matter 타임라인');
    expect(html).toContain('2026-06-15');
    expect(html).toContain(
      '/documents/11111111-1111-4111-8111-111111111114#chunk%3A11111111-1111-4111-8111-111111111116',
    );
    expect(html).toContain('미해결 쟁점');
    expect(html).toContain('다음 액션');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111113');
    expect(html).not.toMatch(
      /legal analysis|summary|external model|endpoint|prompt|source text|model response|secret|raw text/i,
    );
  });
});

function readiness(): AiPrepMatterReadinessDto {
  return {
    matterId: '11111111-1111-4111-8111-111111111113',
    documentCount: 1,
    currentVersionCount: 1,
    readyDocumentCount: 0,
    pendingDocumentCount: 0,
    partialDocumentCount: 1,
    blockedDocumentCount: 0,
    failedDocumentCount: 0,
    rejectedDocumentCount: 0,
    staleDocumentCount: 0,
    notReadyDocumentCount: 0,
    pendingJobCount: 1,
    staleArtifactCount: 0,
    blockedArtifactCount: 0,
    rejectedArtifactCount: 0,
    fallbackArtifactCount: 1,
    timeline: [
      {
        timelineId: 'timeline-1',
        date: '2026-06-15',
        label: '계약서 수령',
        detail: '2026-06-15 계약서 수령',
        documentId: '11111111-1111-4111-8111-111111111114',
        versionId: '11111111-1111-4111-8111-111111111115',
        citationRefs: ['chunk:11111111-1111-4111-8111-111111111116'],
      },
    ],
    openQuestions: [
      {
        question: '상대방 회신 여부 확인',
        neededEvidence: '최근 이메일 또는 송부 기록',
        citationRefs: ['chunk:11111111-1111-4111-8111-111111111116'],
      },
    ],
    recommendedActions: [{ action: '담당 변호사 검토', reviewRequired: true }],
    documents: [
      {
        documentId: '11111111-1111-4111-8111-111111111114',
        title: 'Contract.pdf',
        currentVersionId: '11111111-1111-4111-8111-111111111115',
        aiAllowed: true,
        readinessStatus: 'partial',
        totalArtifactCount: 2,
        completedArtifactCount: 1,
        pendingArtifactCount: 1,
        blockedArtifactCount: 0,
        failedArtifactCount: 0,
        rejectedArtifactCount: 0,
        staleArtifactCount: 0,
        fallbackArtifactCount: 1,
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    ],
  };
}
