import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  DdDataRoomMappingDto,
  DdIssueDto,
  DdRfiDto,
  DdRiskDto,
  DdTraceabilityResponseDto,
} from '@amic-vault/shared';
import { DdMatterReadOnlyView } from '@/components/matter/matter-workstream-readonly';

const matterId = '11111111-1111-4111-8111-111111111122';
const rfiId = '11111111-1111-4111-8111-111111111331';
const mappingId = '11111111-1111-4111-8111-111111111332';
const documentId = '11111111-1111-4111-8111-111111111333';
const issueId = '11111111-1111-4111-8111-111111111334';
const riskId = '11111111-1111-4111-8111-111111111335';
const timestamp = '2026-07-03T00:00:00.000Z';

const rfi = {
  rfiId,
  matterId,
  rfiCode: 'RFI-001',
  category: 'corporate',
  title: 'Corporate charter documents',
  status: 'requested',
  priority: 'high',
  ownerUserId: null,
  dueDate: '2026-07-10',
  overdue: false,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies DdRfiDto;

const mapping = {
  mappingId,
  matterId,
  rfiId,
  documentId,
  versionId: null,
  internalLabel: 'Charter upload',
  sectionPath: '01 Corporate',
  mappingStatus: 'mapped',
  supplementRequestedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies DdDataRoomMappingDto;

const issue = {
  issueId,
  matterId,
  rfiId,
  documentId,
  issueCode: 'DD-ISSUE-001',
  title: 'Missing board consent',
  severity: 'medium',
  status: 'open',
  citationRefs: ['document:charter'],
  reportInclusion: true,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies DdIssueDto;

const risk = {
  riskId,
  matterId,
  issueId,
  riskCode: 'DD-RISK-001',
  category: 'legal',
  severity: 'high',
  likelihood: 'medium',
  status: 'open',
  citationRefs: ['issue:DD-ISSUE-001'],
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies DdRiskDto;

const traceability = {
  matterId,
  rfiCount: 1,
  mappingCount: 1,
  issueCount: 1,
  riskCount: 1,
  traces: [
    {
      rfiId,
      mappingId,
      documentId,
      issueId,
      riskId,
      statusRefs: ['rfi:requested', 'mapping:mapped'],
      citationRefs: ['document:charter', 'issue:DD-ISSUE-001'],
    },
  ],
} satisfies DdTraceabilityResponseDto;

describe('Matter DD read-only page', () => {
  it('renders RFI rows and traceability links', () => {
    const html = renderToStaticMarkup(
      <DdMatterReadOnlyView
        data={{
          issues: [issue],
          mappings: [mapping],
          risks: [risk],
          rfis: [rfi],
          traceability,
        }}
      />,
    );

    expect(html).toContain('RFI-001');
    expect(html).toContain('Corporate charter documents');
    expect(html).toContain('Traceability');
    expect(html).toContain('rfi:requested');
    expect(html).toContain('DD-RISK-001');
  });
});
