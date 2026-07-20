import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { SearchBar } from './search-bar';

const mockState = vi.hoisted(() => ({
  buttonProps: [] as React.ButtonHTMLAttributes<HTMLButtonElement>[],
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    mockState.buttonProps.push(props);
    return <button {...props}>{children}</button>;
  },
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('SearchBar', () => {
  beforeEach(() => {
    mockState.buttonProps = [];
  });

  it('renders the restored query and submit affordance', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchBar initialQuery="closing memo" busy={false} onSearch={() => undefined} />
      </LanguageProvider>,
    );

    expect(html).toContain('aria-label="문서 검색"');
    expect(html).toContain('value="closing memo"');
    expect(html).toContain('aria-label="검색 실행"');
    expect(html).toContain('aria-label="검색 방식"');
    expect(html).toContain('aria-label="키워드 검색"');
    expect(html).toContain('aria-label="의미 검색"');
    expect(html).toContain('aria-label="혼합 검색"');
    expect(html).not.toContain('disabled=""');
  });

  it('locks input and submit while a search is in flight', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchBar initialQuery="closing memo" busy onSearch={() => undefined} />
      </LanguageProvider>,
    );

    expect(html).toContain('disabled=""');
  });

  it('calls back when the semantic mode is selected', () => {
    const onModeChange = vi.fn();
    renderToStaticMarkup(
      <LanguageProvider>
        <SearchBar
          initialQuery="계약 해지"
          busy={false}
          mode="keyword"
          onModeChange={onModeChange}
          onSearch={() => undefined}
        />
      </LanguageProvider>,
    );

    const semanticButton = mockState.buttonProps.find(
      (props) => props['aria-label'] === '의미 검색',
    );
    expect(semanticButton).toBeDefined();
    semanticButton?.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

    expect(onModeChange).toHaveBeenCalledWith('semantic');
  });
});
