import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('announces ordinary empty states politely with labelled title and description', () => {
    const html = renderToStaticMarkup(<EmptyState variant="pre-search" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('검색어를 입력하면 접근 권한이 확인된 파일만 표시됩니다.');
  });

  it('announces fail-closed states assertively', () => {
    const html = renderToStaticMarkup(<EmptyState variant="policy-blocked" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('정보 차단 또는 권한 정책으로 표시할 수 없습니다.');
  });

  it('keeps caller-provided accessibility attributes when a screen needs a custom region', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        role="region"
        aria-live="off"
        aria-labelledby="custom-empty-title"
        aria-describedby="custom-empty-description"
        title="연결된 통합이 없습니다."
        description="상태 API가 준비되면 운영 데이터만 표시됩니다."
      />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-labelledby="custom-empty-title"');
    expect(html).toContain('aria-describedby="custom-empty-description"');
    expect(html).toContain('상태 API가 준비되면 운영 데이터만 표시됩니다.');
  });
});
