import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UploadDuplicateCandidateDto } from '@amic-vault/shared';
import { DuplicateDecisionDialog } from './duplicate-decision-dialog';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    variant?: string;
    size?: string;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

const candidates: UploadDuplicateCandidateDto[] = [
  {
    documentReference: '11111111-1111-4111-8111-111111111123',
    matterCode: 'AMIC-2026-0001',
    matterName: 'Investment Advisory',
    title: 'Investment memo.pdf',
    versionLabel: 'v2 current',
  },
];

describe('DuplicateDecisionDialog', () => {
  it('renders safe duplicate labels without exposing raw refs or hashes', () => {
    const html = renderToStaticMarkup(
      <DuplicateDecisionDialog
        candidates={candidates}
        fileName="Investment memo.pdf"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('중복 문서 처리');
    expect(html).toContain('Investment memo.pdf');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('Investment Advisory');
    expect(html).toContain('v2 current');
    expect(html).toContain('새 문서로 저장');
    expect(html).toContain('선택 문서의 새 버전');
    expect(html).not.toContain(candidates[0]?.documentReference);
    expect(html).not.toContain('a'.repeat(64));
  });

  it('supports a decision-required state with no visible candidates', () => {
    const html = renderToStaticMarkup(
      <DuplicateDecisionDialog
        candidates={[]}
        fileName="restricted.pdf"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('표시 가능한 후보가 없습니다.');
    expect(html).toContain('새 문서로 저장');
    expect(html).toContain('disabled=""');
  });
});
