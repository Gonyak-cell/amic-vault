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
    expect(html).toContain('검색어를 입력하면 접근 가능한 문서만 표시됩니다.');
  });

  it('keeps loading distinct from empty and failure states', () => {
    const html = renderToStaticMarkup(<EmptyState variant="loading" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('불러오는 중입니다.');
    expect(html).not.toContain('표시할 항목이 없습니다.');
    expect(html).not.toContain('불러올 수 없습니다.');
  });

  it('announces fail-closed states assertively', () => {
    const html = renderToStaticMarkup(<EmptyState variant="policy-blocked" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
  });

  it('keeps connection failure separate from request errors and denied states', () => {
    const unavailable = renderToStaticMarkup(<EmptyState variant="api-unavailable" />);
    const requestError = renderToStaticMarkup(<EmptyState variant="api-error" />);
    const denied = renderToStaticMarkup(<EmptyState variant="no-access" />);

    expect(unavailable).toContain('데이터 연결을 확인할 수 없습니다.');
    expect(unavailable).not.toContain('권한');
    expect(requestError).toContain('요청한 데이터를 표시할 수 없습니다.');
    expect(requestError).not.toContain('연결');
    expect(denied).toContain('볼 권한이 없습니다.');
    expect(denied).not.toContain('연결');
  });

  it('keeps caller-provided accessibility attributes when a screen needs a custom region', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        role="region"
        aria-live="off"
        aria-labelledby="custom-empty-title"
        aria-describedby="custom-empty-description"
        title="연결된 통합이 없습니다."
        description="상태 확인이 준비되면 운영 데이터만 표시됩니다."
      />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-labelledby="custom-empty-title"');
    expect(html).toContain('aria-describedby="custom-empty-description"');
    expect(html).toContain('상태 확인이 준비되면 운영 데이터만 표시됩니다.');
  });
});
