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
            createdAt: '2026-06-19T00:00:00.000Z',
            name: '계약서 본문 검색',
            query: {
              query: '계약서',
              filters: { matterCode: 'AMIC-2026-0001' },
              page: 1,
              pageSize: 10,
              target: 'body',
            },
            savedSearchId: '11111111-1111-4111-8111-111111111901',
            updatedAt: '2026-06-19T00:00:00.000Z',
          },
        ]}
        selection={{
          matterCode: 'AMIC-2026-0001',
          target: 'body',
          sortBy: 'updated_desc',
          groupBy: 'matter',
          extractionStatus: 'ocr_pending',
          legalHold: 'document_hold',
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
    expect(html).toContain('OCR 필요');
    expect(html).toContain('파일 삭제 금지');
    expect(html).toContain('보관됨');
    expect(html).toContain('저장 이름');
    expect(html).toContain('검색 목록');
    expect(html).toContain('계약서 본문 검색');
    expect(html).toContain('열기');
    expect(html).toContain('삭제');
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

  it('summarizes display-safe search pattern items', () => {
    expect(
      searchPatternItems('NDA', {
        clientName: 'AMIC',
        dateRange: 'last_30_days',
        extractionStatus: 'failed',
        groupBy: 'client',
        legalHold: 'matter_hold',
        matterName: 'Vault Upgrade',
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
        { label: '추출/OCR', value: '추출 실패' },
        { label: '보존', value: '사건 삭제 금지' },
        { label: '기록', value: '처분 잠금' },
        { label: '수정 기간', value: '최근 30일' },
      ]),
    );
  });
});
