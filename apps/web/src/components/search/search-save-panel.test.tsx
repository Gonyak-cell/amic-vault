import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SearchSavePanel, searchPatternItems } from './search-save-panel';

describe('SearchSavePanel', () => {
  it('renders a persisted saved-search panel without fake data', () => {
    const html = renderToStaticMarkup(
      <SearchSavePanel
        busy={false}
        query="계약서"
        reusableUrl="/search?q=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026-0001&target=body"
        savedSearches={[
          {
            canRevoke: true,
            createdAt: '2026-06-19T00:00:00.000Z',
            lastOpenedAt: '2026-06-19T00:05:00.000Z',
            name: '계약서 본문 검색',
            openCount: 3,
            query: {
              query: '계약서',
              filters: { matterCode: 'AMIC-2026-0001' },
              page: 1,
              pageSize: 10,
              target: 'body',
            },
            savedSearchId: '11111111-1111-4111-8111-111111111901',
            scope: 'matter-team',
            updatedAt: '2026-06-19T00:00:00.000Z',
          },
        ]}
        selection={{
          matterCode: 'AMIC-2026-0001',
          target: 'body',
          sortBy: 'updated_desc',
          groupBy: 'matter',
          confidentialityLevel: 'restricted',
          extractionStatus: 'ocr_pending',
          legalHold: 'document_hold',
          privilegeStatus: 'privileged',
          recordsStatus: 'archived',
        }}
      />,
    );

    expect(html).toContain('저장된 검색');
    expect(html).toContain('현재 검색 조건');
    expect(html).toContain('계약서');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('본문');
    expect(html).toContain('최근 수정');
    expect(html).toContain('제한');
    expect(html).toContain('변호사-의뢰인 특권');
    expect(html).toContain('OCR 필요');
    expect(html).toContain('파일 삭제 금지');
    expect(html).toContain('보관됨');
    expect(html).toContain('저장 이름');
    expect(html).toContain('공유 범위');
    expect(html).toContain('검색 목록');
    expect(html).toContain('계약서 본문 검색');
    expect(html).toContain('Matter 팀');
    expect(html).toContain('3회 열림');
    expect(html).toContain('열기');
    expect(html).toContain('해제');
    expect(html).toContain('/search?q=%EA%B3%84%EC%95%BD%EC%84%9C');
    expect(html).not.toContain('API 준비 전');
    expect(html).not.toContain('임시 저장');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111901');
  });

  it('renders a pre-search state before query input', () => {
    const html = renderToStaticMarkup(
      <SearchSavePanel busy={false} query="" reusableUrl="/search?q=" selection={{}} />,
    );

    expect(html).toContain('검색어를 입력하면 현재 조건을 다시 열 수 있는 링크가 표시됩니다.');
    expect(html).toContain('저장된 검색이 없습니다.');
    expect(html).not.toContain('현재 검색 조건');
  });

  it('hides plaintext reusable URLs when private saved-search references are required', () => {
    const html = renderToStaticMarkup(
      <SearchSavePanel
        busy={false}
        privacyMode="private_saved_ref"
        query="M&A privileged acquisition"
        reusableUrl="/search?q=M%26A+privileged+acquisition&target=body"
        savedSearches={[
          {
            canRevoke: true,
            createdAt: '2026-06-19T00:00:00.000Z',
            lastOpenedAt: null,
            name: 'Private acquisition search',
            openCount: 0,
            query: {
              query: 'M&A privileged acquisition',
              filters: { matterCode: 'AMIC-2026-0001' },
              page: 1,
              pageSize: 10,
              target: 'body',
            },
            savedSearchId: '11111111-1111-4111-8111-111111111901',
            scope: 'personal',
            updatedAt: '2026-06-19T00:00:00.000Z',
          },
        ]}
        selection={{ matterCode: 'AMIC-2026-0001', target: 'body' }}
      />,
    );

    expect(html).toContain('비공개 저장 참조');
    expect(html).toContain('참조 복사');
    expect(html).toContain('Private acquisition search');
    expect(html).not.toContain('/search?q=');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111901');
  });

  it('summarizes display-safe search pattern items', () => {
    expect(
      searchPatternItems('NDA', {
        clientName: 'AMIC',
        confidentialityLevel: 'high',
        dateRange: 'last_30_days',
        extractionStatus: 'failed',
        groupBy: 'client',
        legalHold: 'matter_hold',
        matterName: 'Vault Upgrade',
        privilegeStatus: 'work_product',
        recordsStatus: 'disposal_locked',
        sortBy: 'title_asc',
        target: 'title',
      }),
    ).toEqual(
      expect.arrayContaining([
        { label: '검색어', value: 'NDA' },
        { label: '검색 범위', value: '제목' },
        { label: '정렬', value: '제목' },
        { label: '그룹', value: '고객' },
        { label: 'Matter 이름', value: 'Vault Upgrade' },
        { label: '고객명', value: 'AMIC' },
        { label: '기밀도', value: '높음' },
        { label: '특권', value: '작업 산출물' },
        { label: '추출/OCR', value: '추출 실패' },
        { label: '보존', value: 'Matter 삭제 금지' },
        { label: '기록', value: '처분 잠금' },
        { label: '수정 기간', value: '최근 30일' },
      ]),
    );
  });
});
