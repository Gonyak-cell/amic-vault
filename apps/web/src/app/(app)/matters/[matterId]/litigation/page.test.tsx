import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationFactDto,
  LitigationHearingDto,
  LitigationIssueDto,
  LitigationPleadingDto,
} from '@amic-vault/shared';
import { LitigationMatterReadOnlyView } from '@/components/matter/matter-workstream-readonly';

const matterId = '11111111-1111-4111-8111-111111111122';
const evidenceId = '11111111-1111-4111-8111-111111111441';
const documentId = '11111111-1111-4111-8111-111111111442';
const versionId = '11111111-1111-4111-8111-111111111443';
const factId = '11111111-1111-4111-8111-111111111444';
const issueId = '11111111-1111-4111-8111-111111111445';
const pleadingId = '11111111-1111-4111-8111-111111111446';
const hearingId = '11111111-1111-4111-8111-111111111447';
const timestamp = '2026-07-03T00:00:00.000Z';
const hash = 'c'.repeat(64);

const evidence = {
  evidenceId,
  matterId,
  documentId,
  versionId,
  evidenceCode: 'EV-001',
  evidenceDirection: 'gap',
  evidenceSequence: 1,
  evidenceType: 'document',
  exhibitLabel: 'Exhibit A',
  custodyStatus: 'reviewed',
  admittedStatus: 'offered',
  sourceHash: hash,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationEvidenceDto;

const fact = {
  factId,
  matterId,
  evidenceId,
  factCode: 'FACT-001',
  factSummary: 'Customer sent termination notice on 2026-06-30.',
  factDate: '2026-06-30',
  status: 'verified',
  materiality: 'high',
  citationRefs: ['evidence:EV-001'],
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationFactDto;

const issue = {
  issueId,
  matterId,
  parentIssueId: null,
  issueCode: 'ISSUE-001',
  label: 'Notice validity',
  issueType: 'claim',
  status: 'supported',
  position: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationIssueDto;

const pleading = {
  pleadingId,
  matterId,
  documentId,
  versionId,
  pleadingCode: 'PLD-001',
  pleadingType: 'brief',
  filingStatus: 'internal_draft',
  internalDeadline: '2026-07-15',
  citationRefs: ['fact:FACT-001'],
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationPleadingDto;

const hearing = {
  hearingId,
  matterId,
  pleadingId,
  title: '준비서면 제출기한',
  hearingType: 'deadline',
  scheduledAt: '2026-07-10T00:00:00.000Z',
  courtName: '서울중앙지방법원',
  location: null,
  internalDeadline: '2026-07-03',
  status: 'scheduled',
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationHearingDto;

const caseMap = {
  matterId,
  evidenceCount: 1,
  factCount: 1,
  issueCount: 1,
  pleadingCount: 1,
  caseMap: [
    {
      evidenceId,
      factId,
      issueId,
      pleadingId,
      documentId,
      statusRefs: ['fact:verified', 'issue:supported'],
      citationRefs: ['evidence:EV-001', 'fact:FACT-001'],
    },
  ],
} satisfies LitigationCaseMapResponseDto;

describe('Matter litigation read-only page', () => {
  it('renders Fact Ledger rows and the case map', () => {
    const html = renderToStaticMarkup(
      <LitigationMatterReadOnlyView
        data={{
          caseMap,
          evidence: [evidence],
          facts: [fact],
          hearings: [hearing],
          issues: [issue],
          pleadings: [pleading],
        }}
      />,
    );

    expect(html).toContain('사실관계 원장');
    expect(html).toContain('FACT-001');
    expect(html).toContain('사건 관계도');
    expect(html).toContain('준비서면 제출기한');
    expect(html).not.toContain('fact:verified');
    expect(html).toContain('EV-001');
  });
});
