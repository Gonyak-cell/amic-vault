import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResultDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import {
  ResultCard,
  documentSearchHitUrlForSearchResult,
  documentVersionUrlForSearchResult,
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
  author: {
    userId: '11111111-1111-4111-8111-111111111101',
    displayName: 'Alpha Matter Owner',
  },
  clientId: '11111111-1111-4111-8111-111111111204',
  clientDisplayName: 'AMIC',
  contentTruncated: true,
  title: 'Escrow Closing Memo',
  snippet: 'Escrow <script>alert(1)</script> closing memo',
  highlights: [{ anchorId: 'vph-1-0-6', start: 0, end: 6 }],
  documentType: 'memo',
  extractionStatus: 'ocr_pending',
  permissionBadges: {
    confidentiality: 'restricted',
    legalHold: 'document_hold',
    privilege: 'privileged',
  },
  aiAllowed: true,
  prevVersionId: '11111111-1111-4111-8111-111111111206',
  nextVersionId: '11111111-1111-4111-8111-111111111207',
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
      'href="/documents/11111111-1111-4111-8111-111111111201?from=search&amp;target=all&amp;hit=1&amp;hitCount=1&amp;anchor=vph-1-0-6"',
    );
    expect(html).toContain('문서 열기');
    expect(html).toContain('미리보기');
    expect(html).toContain('문서함');
    expect(html).not.toContain('/v1/documents/11111111-1111-4111-8111-111111111201/preview');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007&amp;title=Escrow+Closing+Memo"');
    expect(html).toContain('Escrow Closing Memo');
    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).toContain('AMIC');
    expect(html).toContain('memo');
    expect(html).toContain('2026-06-12');
    expect(html).toContain('작성자 Alpha Matter Owner');
    expect(html).toContain('비밀등급 제한');
    expect(html).toContain('특권');
    expect(html).toContain('문서 보존');
    expect(html).toContain('AI 가능');
    expect(html).toContain('부분 인덱스');
    expect(html).toContain('이전 버전');
    expect(html).toContain('다음 버전');
    expect(html).toContain(
      'href="/documents/11111111-1111-4111-8111-111111111201?versionId=11111111-1111-4111-8111-111111111206"',
    );
    expect(html).toContain('OCR 필요');
    expect(html).toContain('본문 검색 품질이 제한될 수 있습니다.');
    expect(html).not.toContain('고객');
    expect(html).not.toContain('표시 가능한 정보 없음');
    expect(html).not.toContain('ID 11111111');
    expect(html).not.toContain(result.matterId);
    expect(html).not.toContain(result.clientId);
    expect(html).toContain('<mark');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('0.753');
    expect(html).not.toContain('유사도 75%');
    expect(html).not.toContain('일치 문맥');
    expect(html).not.toContain('>current<');
    expect(html).not.toContain(encodeURIComponent(result.snippet));
  });

  it('shows similarity and chunk context for semantic results', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard mode="semantic" result={result} />
      </LanguageProvider>,
    );

    expect(html).toContain('유사도 75%');
    expect(html).toContain('일치 문맥');
    expect(html).toContain('Escrow');
    expect(html).not.toContain('0.753');
  });

  it('renders a clause search variant linked to the source document', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard
          result={{
            ...result,
            clauseId: '11111111-1111-4111-8111-111111111208',
            clauseKind: 'article',
            clauseNumber: '제12조',
            documentType: 'contract',
            resultKind: 'clause',
            snippet: '손해배상 책임 한도는 계약금액으로 제한한다.',
          }}
          target="clause"
        />
      </LanguageProvider>,
    );

    expect(html).toContain('원문 열기');
    expect(html).toContain('조항 제12조');
    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).toContain('contract');
    expect(html).toContain('target=clause');
    expect(html).not.toContain('vault-preview-target=clause');
    expect(html).toContain('손해배상 책');
    expect(html).toContain('임 한도는 계약금액으로 제한한다.');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111208');
  });

  it('renders an authority search result without document actions', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard
          result={{
            aiAllowed: false,
            author: null,
            authorityId: '11111111-1111-4111-8111-111111111309',
            citation: '상법 제398조',
            clientDisplayName: null,
            contentTruncated: false,
            documentType: 'authority',
            externalRef: '001570-398',
            highlights: [{ start: 0, end: 2 }],
            matterDisplayCode: null,
            matterDisplayName: null,
            nextVersionId: null,
            permissionBadges: {
              confidentiality: 'standard',
              legalHold: 'no_hold',
              privilege: 'none',
            },
            prevVersionId: null,
            resultKind: 'authority',
            score: 0.94,
            snippet: '상법 제398조 이사 등과 회사 간의 거래',
            sourceType: 'law_statute',
            sourceUrl: 'https://www.law.go.kr/법령/상법/제398조',
            title: '상법',
            updatedAt: '2026-06-12T10:00:00.000Z',
            versionStatus: 'public',
          }}
          target="authority"
        />
      </LanguageProvider>,
    );

    expect(html).toContain('상법');
    expect(html).toContain('상법 제398조');
    expect(html).toContain('외부 공개자료');
    expect(html).toContain('원문 보기');
    expect(html).toContain('href="https://www.law.go.kr/법령/상법/제398조"');
    expect(html).not.toContain('문서 열기');
    expect(html).not.toContain('미리보기');
    expect(html).not.toContain('문서함');
    expect(html).not.toContain('/documents/');
  });

  it('does not use document id as a title fallback', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <ResultCard result={{ ...result, title: '' }} />
      </LanguageProvider>,
    );

    expect(html).toContain('제목 없음');
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
      '/documents/11111111-1111-4111-8111-111111111201?from=search&target=body&hit=1&hitCount=1&anchor=vph-1-0-6',
    );
    expect(documentSearchHitUrlForSearchResult({ ...result, highlights: [] }, 'title')).toBe(
      '/documents/11111111-1111-4111-8111-111111111201?from=search&target=title',
    );
    expect(documentSearchHitUrlForSearchResult(result, 'body')).not.toContain('Escrow');
    expect(documentSearchHitUrlForSearchResult(result, 'body')).not.toContain('closing');
  });

  it('builds bounded version navigation links without snippets or query text', () => {
    expect(documentVersionUrlForSearchResult(result, result.prevVersionId!)).toBe(
      '/documents/11111111-1111-4111-8111-111111111201?versionId=11111111-1111-4111-8111-111111111206',
    );
    expect(documentVersionUrlForSearchResult(result, result.prevVersionId!)).not.toContain(
      'Escrow',
    );
    expect(documentVersionUrlForSearchResult(result, result.prevVersionId!)).not.toContain(
      'closing',
    );
  });
});
