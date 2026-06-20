import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { RecordsGovernanceClient } from './records-governance-client';

const navigationMock = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigationMock.searchParams,
}));

describe('RecordsGovernanceClient', () => {
  beforeEach(() => {
    navigationMock.searchParams = new URLSearchParams();
  });

  it('uses governance copy without exposing internal ID or hash labels', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <RecordsGovernanceClient />
      </LanguageProvider>,
    );

    expect(html).toContain('기록 보존');
    expect(html).toContain('정책 코드');
    expect(html).toContain('aria-label="보존 관리"');
    expect(html).toContain('for="records-policy-code"');
    expect(html).toContain('id="records-policy-code"');
    expect(html).toContain('id="records-retention-days"');
    expect(html).toContain('type="number"');
    expect(html).toContain('보존 정책');
    expect(html).toContain('삭제 금지');
    expect(html).toContain('증명서');
    expect(html).toContain('등록된 보존 정책이 없습니다.');
    expect(html).not.toContain('고급 참조 입력');
    expect(html).not.toContain('파일 ID');
    expect(html).not.toContain('삭제 금지 ID');
    expect(html).not.toContain('삭제 요청 ID');
    expect(html).not.toContain('증명서 ID');
    expect(html).not.toContain('파일 해시');
    expect(html).not.toContain('증명서 해시');
    expect(html).not.toContain('검증값');
    expect(html).not.toContain('RET-INDEFINITE');
    expect(html).not.toContain('Indefinite retention');
    expect(html).not.toContain('CLIENT_RECORDS');
  });

  it('uses document context query labels without displaying raw record refs', () => {
    navigationMock.searchParams = new URLSearchParams({
      tab: 'archive',
      documentId: '11111111-1111-4111-8111-111111111201',
      matterCode: 'AMIC-2026-0007',
      documentTitle: '계약 검토 자료',
    });

    const html = renderToStaticMarkup(
      <LanguageProvider>
        <RecordsGovernanceClient />
      </LanguageProvider>,
    );

    expect(html).toContain('계약 검토 자료');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('보존 작업 준비');
    expect(html).toContain('삭제 금지 검토');
    expect(html).toContain('보관 처리 준비');
    expect(html).toContain('삭제 요청 준비');
    expect(html).toContain('증명서 확인');
    expect(html).toContain('작업 대상 선택');
    expect(html).toContain('대상 Matter');
    expect(html).toContain('대상 파일');
    expect(html).toContain('보관 처리');
    expect(html).not.toContain('id="records-archive-document-ref"');
    expect(html).not.toContain('고급 참조 입력');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111201');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111122');
  });

  it('keeps matter-only records context limited to matter-level hold actions', () => {
    navigationMock.searchParams = new URLSearchParams({
      tab: 'holds',
      matterId: '11111111-1111-4111-8111-111111111122',
      matterCode: 'AMIC-2026-0008',
    });

    const html = renderToStaticMarkup(
      <LanguageProvider>
        <RecordsGovernanceClient />
      </LanguageProvider>,
    );

    expect(html).toContain('보존 작업 준비');
    expect(html).toContain('AMIC-2026-0008');
    expect(html).toContain('삭제 금지 검토');
    expect(html).toContain('작업 대상 선택');
    expect(html).toContain('대상 Matter');
    expect(html).not.toContain('보관 처리 준비');
    expect(html).not.toContain('삭제 요청 준비');
    expect(html).not.toContain('증명서 확인');
    expect(html).not.toContain('고급 참조 입력');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111122');
  });
});
