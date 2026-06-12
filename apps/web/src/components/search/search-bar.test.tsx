import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from './search-bar';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('SearchBar', () => {
  it('renders the restored query and submit affordance', () => {
    const html = renderToStaticMarkup(
      <SearchBar initialQuery="closing memo" busy={false} onSearch={() => undefined} />,
    );

    expect(html).toContain('aria-label="Search documents"');
    expect(html).toContain('value="closing memo"');
    expect(html).toContain('aria-label="Run search"');
    expect(html).not.toContain('disabled=""');
  });

  it('locks input and submit while a search is in flight', () => {
    const html = renderToStaticMarkup(
      <SearchBar initialQuery="closing memo" busy onSearch={() => undefined} />,
    );

    expect(html).toContain('disabled=""');
  });
});
