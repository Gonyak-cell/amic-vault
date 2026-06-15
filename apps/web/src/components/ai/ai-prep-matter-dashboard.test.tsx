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

    expect(html).toContain('AI 준비 상태');
    expect(html).toContain('준비 완료');
    expect(html).toContain('계약서.pdf');
    expect(html).toContain('일부 준비');
    expect(html).toContain('AI 준비 다시 실행');
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
    staleDocumentCount: 0,
    notReadyDocumentCount: 0,
    pendingJobCount: 1,
    staleArtifactCount: 0,
    blockedArtifactCount: 0,
    documents: [
      {
        documentId: '11111111-1111-4111-8111-111111111114',
        title: '계약서.pdf',
        currentVersionId: '11111111-1111-4111-8111-111111111115',
        aiAllowed: true,
        readinessStatus: 'partial',
        totalArtifactCount: 2,
        completedArtifactCount: 1,
        pendingArtifactCount: 1,
        blockedArtifactCount: 0,
        failedArtifactCount: 0,
        staleArtifactCount: 0,
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    ],
  };
}
