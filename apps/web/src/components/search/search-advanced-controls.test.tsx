import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SearchAdvancedControls } from './search-advanced-controls';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string;
    variant?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('SearchAdvancedControls', () => {
  it('renders enterprise search controls without raw id prompts', () => {
    const html = renderToStaticMarkup(
      <SearchAdvancedControls
        busy={false}
        selection={{
          clientName: 'AMIC',
          groupBy: 'matter',
          matterCode: 'AMIC-2026-0007',
          sortBy: 'updated_desc',
          target: 'body',
          title: 'closing',
        }}
        onApply={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(html).toContain('검색 필터');
    expect(html).toContain('검색 범위');
    expect(html).toContain('본문');
    expect(html).toContain('정렬');
    expect(html).toContain('최근 수정');
    expect(html).toContain('그룹');
    expect(html).toContain('Matter Code');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('고객명');
    expect(html).toContain('적용');
    expect(html).toContain('초기화');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('Client ID');
    expect(html).not.toContain('Document ID');
  });
});
