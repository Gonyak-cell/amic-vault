import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SearchSavePanel, searchPatternItems } from './search-save-panel';

describe('SearchSavePanel', () => {
  it('renders a reusable current-search pattern without fake persistence claims', () => {
    const html = renderToStaticMarkup(
      <SearchSavePanel
        busy={false}
        query="계약서"
        reusableUrl="/search?q=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026-0001&target=body"
        selection={{
          matterCode: 'AMIC-2026-0001',
          target: 'body',
          sortBy: 'updated_desc',
          groupBy: 'matter',
        }}
      />,
    );

    expect(html).toContain('검색 저장 준비');
    expect(html).toContain('현재 검색 조건');
    expect(html).toContain('계약서');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('본문');
    expect(html).toContain('최근 수정');
    expect(html).toContain('저장된 검색');
    expect(html).toContain('disabled=""');
    expect(html).toContain('임시 저장');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });

  it('renders a pre-search state before query input', () => {
    const html = renderToStaticMarkup(
      <SearchSavePanel busy={false} query="" reusableUrl="/search?q=" selection={{}} />,
    );

    expect(html).toContain('검색어를 입력하면 현재 조건을 다시 열 수 있는 링크가 표시됩니다.');
    expect(html).not.toContain('현재 검색 조건');
  });

  it('summarizes display-safe search pattern items', () => {
    expect(
      searchPatternItems('NDA', {
        clientName: 'AMIC',
        dateRange: 'last_30_days',
        groupBy: 'client',
        matterName: 'Vault Upgrade',
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
        { label: '수정 기간', value: '최근 30일' },
      ]),
    );
  });
});
