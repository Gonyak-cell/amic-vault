import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConflictCheckDto, MatterDto } from '@amic-vault/shared';
import {
  formatConflictSimilarity,
  MatterConflictsPanelView,
  latestConflictCheck,
} from './matter-conflicts-panel';

const matter = {
  clientId: '11111111-1111-4111-8111-111111111111',
  clientDisplayName: '한빛전자',
  confidentialityLevel: 'standard',
  conflictsStatus: 'blocked',
  createdAt: '2026-07-02T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111101',
  displayName: '한빛 신규 자문',
  ethicalWallActive: false,
  leadAssociateId: null,
  legalHold: false,
  matterCode: 'AMIC-2026-1001',
  matterId: '11111111-1111-4111-8111-111111111122',
  matterName: '한빛 신규 자문',
  matterType: 'advisory',
  metadata: {},
  openedAt: null,
  closedAt: null,
  practiceGroup: '기업자문',
  safeLabel: '한빛 신규 자문',
  status: 'proposed',
  tenantId: '11111111-1111-4111-8111-111111111100',
  updatedAt: '2026-07-02T00:00:00.000Z',
  leadLawyerId: null,
  leadPartnerId: null,
} satisfies MatterDto;

const check = {
  conflictCheckId: '11111111-1111-4111-8111-111111111701',
  matterId: matter.matterId,
  status: 'in_review',
  targetNames: ['한빛전자'],
  candidates: [
    {
      sourceType: 'party',
      sourceId: '11111111-1111-4111-8111-111111111144',
      sourceName: '(주)한빛전자',
      sourceMatterId: '11111111-1111-4111-8111-111111111155',
      sourceMatterName: '한빛 선행 자문',
      targetName: '한빛전자',
      similarity: 0.91,
    },
  ],
  createdBy: '11111111-1111-4111-8111-111111111101',
  createdAt: '2026-07-02T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
  resolvedBy: null,
  resolvedAt: null,
  resolutionRationale: null,
} satisfies ConflictCheckDto;

describe('MatterConflictsPanelView', () => {
  it('renders conflict status, candidates, and wall setup entry point', () => {
    const html = renderToStaticMarkup(
      <MatterConflictsPanelView
        actionState="idle"
        checks={[check]}
        loadStatus="ready"
        matter={matter}
        rationale="내부 검토 중"
      />,
    );

    expect(html).toContain('이해상충');
    expect(html).toContain('차단됨');
    expect(html).toContain('최근 검토: 검토 중');
    expect(html).toContain('/walls 정보 차단 설정');
    expect(html).toContain('한빛전자');
    expect(html).toContain('(주)한빛전자');
    expect(html).toContain('당사자');
    expect(html).toContain('91%');
    expect(html).toContain('한빛 선행 자문');
  });

  it('keeps resolution actions disabled until rationale is present', () => {
    const html = renderToStaticMarkup(
      <MatterConflictsPanelView
        actionState="idle"
        checks={[check]}
        loadStatus="ready"
        matter={{ ...matter, conflictsStatus: 'in_review' }}
        rationale=""
      />,
    );

    expect(html).toContain('판단 근거');
    expect(html).toContain('해소 승인');
    expect(html).toContain('수임 차단');
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('selects the latest check and formats bounded similarity scores', () => {
    expect(latestConflictCheck([check])?.conflictCheckId).toBe(check.conflictCheckId);
    expect(formatConflictSimilarity(0.625)).toBe('63%');
    expect(formatConflictSimilarity(91)).toBe('91%');
    expect(formatConflictSimilarity(Number.NaN)).toBe('-');
  });
});
