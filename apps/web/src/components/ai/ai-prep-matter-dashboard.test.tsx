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

    expect(html).toContain('파일 정리 준비 상태');
    expect(html).toContain('사건 파일 정리 준비 목록');
    expect(html).toContain('정리됨');
    expect(html).toContain('폐기');
    expect(html).toContain('대체 정리 항목');
    expect(html).toContain('Contract.pdf');
    expect(html).toContain('일부 정리됨');
    expect(html).toContain('파일 정리 준비 다시 실행');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111113');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111114');
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
