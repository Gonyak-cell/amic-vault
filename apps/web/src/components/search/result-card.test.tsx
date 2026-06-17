import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResultDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { ResultCard } from './result-card';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const result: SearchResultDto = {
  documentId: '11111111-1111-4111-8111-111111111201',
  versionId: '11111111-1111-4111-8111-111111111202',
  matterId: '11111111-1111-4111-8111-111111111203',
  clientId: '11111111-1111-4111-8111-111111111204',
  title: 'Escrow Closing Memo',
  snippet: 'Escrow <script>alert(1)</script> closing memo',
  highlights: [{ start: 0, end: 6 }],
  documentType: 'memo',
  versionStatus: 'current',
  score: 0.753,
  updatedAt: '2026-06-12T10:00:00.000Z',
};

describe('ResultCard', () => {
  it('renders only authorized result fields with escaped highlight markup', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard result={result} />
      </LanguageProvider>,
    );

    expect(html).toContain('href="/documents/11111111-1111-4111-8111-111111111201"');
    expect(html).toContain('Escrow Closing Memo');
    expect(html).toContain('memo');
    expect(html).toContain('2026-06-12');
    expect(html).not.toContain('Matter');
    expect(html).not.toContain('고객');
    expect(html).not.toContain('표시 가능한 정보 없음');
    expect(html).not.toContain('ID 11111111');
    expect(html).not.toContain(result.matterId);
    expect(html).not.toContain(result.clientId);
    expect(html).toContain('<mark');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('0.753');
    expect(html).not.toContain('current');
    expect(html).not.toMatch(/\bAI\b|semantic|recommend/i);
  });

  it('does not use document id as a title fallback', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard result={{ ...result, title: '' }} />
      </LanguageProvider>,
    );

    expect(html).toContain('표시 가능한 제목 없음');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111201</a>');
  });
});
