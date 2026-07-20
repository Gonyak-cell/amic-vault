import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NegotiationIssueDto } from '@amic-vault/shared';
import { NegotiationIssuesTable } from './negotiation-issues-table';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const issue = {
  issueId: '11111111-1111-4111-8111-111111111227',
  matterId: '11111111-1111-4111-8111-111111111122',
  documentId: '11111111-1111-4111-8111-111111111223',
  versionId: '11111111-1111-4111-8111-111111111224',
  clauseId: '11111111-1111-4111-8111-111111111225',
  redlineChangeId: '11111111-1111-4111-8111-111111111228',
  changeType: 'added',
  redlineTextHash: hashA,
  ruleId: '11111111-1111-4111-8111-111111111226',
  ruleKey: 'governing_law',
  ruleVersion: 3,
  severity: 'critical',
  findingStatus: 'fail',
  findingCode: 'rule.finding.missing_governing_law',
  findingHash: hashB,
  status: 'open',
  citationRefs: ['redline:11111111-1111-4111-8111-111111111228', 'clause:governing_law'],
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
} satisfies NegotiationIssueDto;

describe('NegotiationIssuesTable', () => {
  it('renders negotiation issue rows with status controls and citations', () => {
    const html = renderToStaticMarkup(
      <NegotiationIssuesTable issues={[issue]} onStatusChange={() => undefined} />,
    );

    expect(html).toContain('협상쟁점표');
    expect(html).toContain('rule.finding.missing_governing_law');
    expect(html).toContain('governing_law v3');
    expect(html).toContain('aaaaaaaaaaaa');
    expect(html).toContain('검토 중');
    expect(html).toContain('value="agreed"');
    expect(html).toContain('합의');
    expect(html).toContain('value="dropped"');
    expect(html).toContain('redline:11111111-1111-4111-8111-111111111228');
    expect(html).not.toContain('disabled=""');
  });

  it('renders an empty state when no negotiation issues exist', () => {
    const html = renderToStaticMarkup(<NegotiationIssuesTable issues={[]} />);

    expect(html).toContain('협상 쟁점이 없습니다.');
  });
});
