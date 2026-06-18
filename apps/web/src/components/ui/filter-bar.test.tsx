import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { FilterBar, FilterField } from './filter-bar';
import { Input } from './input';

describe('FilterBar', () => {
  it('renders a tokenized enterprise filter shell with labeled controls', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        actions={<Button type="button">적용</Button>}
        label="감사 필터"
        resultsSummary="표시 가능한 결과만 표시"
        title="필터"
      >
        <FilterField description="권한이 허용된 결과만 조회합니다." htmlFor="actor" label="수행자">
          <Input id="actor" name="actor" />
        </FilterField>
      </FilterBar>,
    );

    expect(html).toContain('aria-label="감사 필터"');
    expect(html).toContain('rounded-lg');
    expect(html).toContain('border');
    expect(html).toContain('bg-card');
    expect(html).toContain('text-muted-foreground');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('for="actor"');
    expect(html).toContain('적용');
  });

  it('supports explicit controls without inventing mock values', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        controls={<FilterField label="상태">선택 안 됨</FilterField>}
        label="정책 필터"
      />,
    );

    expect(html).toContain('정책 필터');
    expect(html).toContain('선택 안 됨');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('workspace');
  });
});
