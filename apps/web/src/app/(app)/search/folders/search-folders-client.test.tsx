import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  SearchFoldersContent,
  searchUrlForSavedQuery,
} from './search-folders-client';

describe('SearchFoldersContent', () => {
  it('renders saved searches as search folders without exposing raw folder ids', () => {
    const html = renderToStaticMarkup(
      <SearchFoldersContent
        busy={false}
        folders={[
          {
            createdAt: '2026-06-19T00:00:00.000Z',
            name: 'NDA 본문 폴더',
            query: {
              query: 'NDA',
              filters: {
                matterCode: 'AMIC-2026-0001',
                clientName: 'AMIC',
                documentType: 'contract',
                extractionStatus: 'failed',
                legalHold: 'document_hold',
                recordsStatus: 'archived',
              },
              page: 1,
              pageSize: 10,
              sortBy: 'updated_desc',
              target: 'body',
            },
            savedSearchId: '11111111-1111-4111-8111-111111111902',
            updatedAt: '2026-06-19T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('내 검색 폴더');
    expect(html).toContain('NDA 본문 폴더');
    expect(html).toContain('검색 폴더');
    expect(html).toContain('Matter Code');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('고객');
    expect(html).toContain('AMIC');
    expect(html).toContain('추출/OCR');
    expect(html).toContain('추출 실패');
    expect(html).toContain('보존');
    expect(html).toContain('파일 삭제 금지');
    expect(html).toContain('기록');
    expect(html).toContain('보관됨');
    expect(html).toContain('href="/search?q=NDA');
    expect(html).toContain('target=body');
    expect(html).toContain('sortBy=updated_desc');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111902');
    expect(html).not.toContain('API 준비 전');
    expect(html).not.toContain('김민준');
  });

  it('renders a no-data state with a search entry point', () => {
    const html = renderToStaticMarkup(<SearchFoldersContent busy={false} folders={[]} />);

    expect(html).toContain('저장된 검색 폴더가 없습니다.');
    expect(html).toContain('href="/search"');
    expect(html).toContain('문서 검색으로 이동');
  });

  it('builds display-safe search URLs from supported saved query fields', () => {
    expect(
      searchUrlForSavedQuery({
        query: '주식매매계약서',
        filters: {
          clientName: 'AMIC',
          matterCode: 'AMIC-2026-0002',
          title: 'SPA',
          extractionStatus: 'ocr_pending',
          legalHold: 'matter_hold',
          recordsStatus: 'disposal_locked',
          versionStatus: 'current',
        },
        groupBy: 'matter',
        page: 1,
        pageSize: 10,
        target: 'title',
      }),
    ).toBe(
      '/search?q=%EC%A3%BC%EC%8B%9D%EB%A7%A4%EB%A7%A4%EA%B3%84%EC%95%BD%EC%84%9C&target=title&groupBy=matter&matterCode=AMIC-2026-0002&clientName=AMIC&title=SPA&extractionStatus=ocr_pending&legalHold=matter_hold&recordsStatus=disposal_locked&versionStatus=current',
    );
  });
});
