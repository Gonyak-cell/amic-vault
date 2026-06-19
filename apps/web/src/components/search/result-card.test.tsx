import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResultDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import {
  ResultCard,
  documentSearchHitUrlForSearchResult,
  fileCabinetUrlForSearchResult,
} from './result-card';

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
  matterDisplayCode: 'AMIC-2026-0007',
  matterDisplayName: 'Vault Upgrade',
  clientId: '11111111-1111-4111-8111-111111111204',
  clientDisplayName: 'AMIC',
  title: 'Escrow Closing Memo',
  snippet: 'Escrow <script>alert(1)</script> closing memo',
  highlights: [{ start: 0, end: 6 }],
  documentType: 'memo',
  extractionStatus: 'ocr_pending',
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

    expect(html).toContain(
      'href="/documents/11111111-1111-4111-8111-111111111201?from=search&amp;target=all&amp;hit=1&amp;hitCount=1"',
    );
    expect(html).toContain('문서 열기');
    expect(html).toContain('미리보기');
    expect(html).toContain('문서함');
    expect(html).toContain(
      'href="http://localhost:3001/v1/documents/11111111-1111-4111-8111-111111111201/preview"',
    );
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007&amp;title=Escrow+Closing+Memo"');
    expect(html).toContain('Escrow Closing Memo');
    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).toContain('AMIC');
    expect(html).toContain('memo');
    expect(html).toContain('2026-06-12');
    expect(html).toContain('OCR 필요');
    expect(html).toContain('본문 검색 품질이 제한될 수 있습니다.');
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
    expect(html).not.toContain('>current<');
    expect(html).not.toMatch(/\bAI\b|semantic|recommend/i);
    expect(html).not.toContain(encodeURIComponent(result.snippet));
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

  it('builds a document cabinet filter from display-safe fields only', () => {
    expect(fileCabinetUrlForSearchResult(result)).toBe(
      '/files?matterCode=AMIC-2026-0007&title=Escrow+Closing+Memo',
    );
    expect(
      fileCabinetUrlForSearchResult({
        ...result,
        matterDisplayCode: '',
        title: '',
        displayName: '',
      }),
    ).toBe('/files');
  });

  it('builds search hit document links without putting snippets or query text in the URL', () => {
    expect(documentSearchHitUrlForSearchResult(result, 'body')).toBe(
      '/documents/11111111-1111-4111-8111-111111111201?from=search&target=body&hit=1&hitCount=1',
    );
    expect(documentSearchHitUrlForSearchResult({ ...result, highlights: [] }, 'title')).toBe(
      '/documents/11111111-1111-4111-8111-111111111201?from=search&target=title',
    );
    expect(documentSearchHitUrlForSearchResult(result, 'body')).not.toContain('Escrow');
    expect(documentSearchHitUrlForSearchResult(result, 'body')).not.toContain('closing');
  });
});
