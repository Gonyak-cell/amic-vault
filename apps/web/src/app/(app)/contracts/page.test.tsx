import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClauseBankEntryDto, ClauseSearchResultDto } from '@amic-vault/shared';
import { ClauseBankTable, ClauseSearchResults } from './clause-bank-browser';
import ContractsPage from './page';

const entry = {
  entryId: '11111111-1111-4111-8111-111111111301',
  status: 'draft',
  sourceClauseId: '11111111-1111-4111-8111-111111111302',
  matterId: '11111111-1111-4111-8111-111111111303',
  documentId: '11111111-1111-4111-8111-111111111304',
  versionId: '11111111-1111-4111-8111-111111111305',
  clauseKind: 'section',
  clauseNumber: '12.3',
  headingHash: 'a'.repeat(64),
  textHash: 'b'.repeat(64),
  tags: ['nda', 'governing_law'],
  usageCount: 0,
  proposedBy: '11111111-1111-4111-8111-111111111100',
  approvedBy: null,
  sourceAccessible: true,
  citationRef: 'clause:11111111-1111-4111-8111-111111111302',
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies ClauseBankEntryDto;

describe('Contracts clause bank page', () => {
  it('renders the firm clause bank surface with status filtering', () => {
    const html = renderToStaticMarkup(<ContractsPage />);

    expect(html).toContain('조항은행');
    expect(html).toContain('상태');
    expect(html).toContain('승인 대기');
    expect(html).toContain('승인됨');
    expect(html).toContain('조항은행을 불러오는 중입니다.');
    expect(html).toContain('유사 조항');
    expect(html).toContain('손해배상 책임 상한');
  });

  it('renders clause bank entries and approval actions without source text', () => {
    const html = renderToStaticMarkup(
      <ClauseBankTable entries={[entry]} busyEntryId={null} onApprove={async () => undefined} />,
    );

    expect(html).toContain('12.3');
    expect(html).toContain('governing_law');
    expect(html).toContain('clause:11111111-1111-4111-8111-111111111302');
    expect(html).toContain('승인');
    expect(html).not.toContain('Confidential Information');
    expect(html).not.toContain('raw clause body');
  });

  it('does not expose source ids for inaccessible approved entries', () => {
    const restricted = {
      ...entry,
      status: 'approved',
      matterId: null,
      documentId: null,
      versionId: null,
      sourceAccessible: false,
      citationRef: 'clause-bank:11111111-1111-4111-8111-111111111301',
    } satisfies ClauseBankEntryDto;
    const html = renderToStaticMarkup(
      <ClauseBankTable entries={[restricted]} busyEntryId={null} onApprove={async () => undefined} />,
    );

    expect(html).toContain('권한 제한');
    expect(html).toContain('승인됨');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111304');
  });

  it('renders similar clause results without source text', () => {
    const result = {
      clauseId: '11111111-1111-4111-8111-111111111401',
      clauseBankEntryId: '11111111-1111-4111-8111-111111111402',
      matterId: '11111111-1111-4111-8111-111111111403',
      documentId: '11111111-1111-4111-8111-111111111404',
      versionId: '11111111-1111-4111-8111-111111111405',
      clauseKind: 'section',
      clauseNumber: '7',
      headingHash: 'c'.repeat(64),
      textHash: 'd'.repeat(64),
      tags: ['liability_cap'],
      approved: true,
      score: 1.08,
      semanticScore: 1,
      citationRef: 'clause:11111111-1111-4111-8111-111111111401',
    } satisfies ClauseSearchResultDto;
    const html = renderToStaticMarkup(<ClauseSearchResults results={[result]} />);

    expect(html).toContain('liability_cap');
    expect(html).toContain('1.080');
    expect(html).toContain('clause:11111111-1111-4111-8111-111111111401');
    expect(html).not.toContain('손해배상액은 책임한도로 제한된다');
    expect(html).not.toContain('raw clause body');
  });
});
