import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConflictCheckDto, MatterDto } from '@amic-vault/shared';

import { ApiClientError } from '@/lib/api-client';
import {
  type ConflictLoadStatus,
  conflictChecksStateForMatter,
  conflictLoadStatusForError,
  createConflictChecksRequestCoordinator,
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
    expect(html).toContain('정보 차단 설정 보기');
    expect(html).not.toContain('/walls 정보 차단 설정');
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

  it('renders loading, empty, unavailable, denied, and Wall states distinctly', () => {
    const renderState = (
      loadStatus: React.ComponentProps<typeof MatterConflictsPanelView>['loadStatus'],
    ) =>
      renderToStaticMarkup(
        <MatterConflictsPanelView
          actionState="idle"
          checks={[]}
          loadStatus={loadStatus}
          matter={{ ...matter, conflictsStatus: 'cleared' }}
          rationale=""
        />,
      );

    const loading = renderState('loading');
    const empty = renderState('empty');
    const unavailable = renderState('unavailable');
    const denied = renderState('forbidden');
    const wall = renderState('blocked');

    expect(loading).toContain('이해상충 검토 이력을 불러오는 중입니다.');
    expect(loading).toContain('요청한 데이터를 준비하고 있습니다.');
    expect(loading).not.toContain('데이터 연결을 확인할 수 없습니다.');
    expect(empty).toContain('검토 이력이 없습니다.');
    expect(unavailable).toContain('이해상충 검토 이력 연결에 실패했습니다.');
    expect(unavailable).toContain('데이터 연결을 확인할 수 없습니다.');
    expect(denied).toContain('이해상충 검토 이력을 볼 권한이 없습니다.');
    expect(denied).not.toContain('정보 차단 정책');
    expect(wall).toContain('권한 정책으로 검토 이력이 차단되었습니다.');
    expect(wall).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
  });

  it('maps transport, denied, Wall, and API failures without collapsing their state', () => {
    expect(conflictLoadStatusForError(new TypeError('fetch failed'))).toBe('unavailable');
    expect(conflictLoadStatusForError(new ApiClientError(403, { code: 'PERMISSION_DENIED' }))).toBe(
      'forbidden',
    );
    expect(
      conflictLoadStatusForError(new ApiClientError(403, { code: 'ETHICAL_WALL_BLOCKED' })),
    ).toBe('blocked');
    expect(conflictLoadStatusForError(new ApiClientError(500, { code: 'VALIDATION_FAILED' }))).toBe(
      'error',
    );
  });

  it('keeps normal and active-conflict Matter states visually separate', () => {
    const normal = renderToStaticMarkup(
      <MatterConflictsPanelView
        actionState="idle"
        checks={[{ ...check, status: 'cleared' }]}
        loadStatus="ready"
        matter={{ ...matter, conflictsStatus: 'cleared' }}
        rationale=""
      />,
    );
    const conflict = renderToStaticMarkup(
      <MatterConflictsPanelView
        actionState="idle"
        checks={[{ ...check, status: 'blocked' }]}
        loadStatus="ready"
        matter={matter}
        rationale=""
      />,
    );

    expect(normal).toContain('해소됨');
    expect(normal).not.toContain('정보 차단 설정 보기');
    expect(conflict).toContain('차단됨');
    expect(conflict).toContain('정보 차단 설정 보기');
    expect(conflict).toContain('href="/walls"');
  });

  it('selects the latest check and formats bounded similarity scores', () => {
    expect(latestConflictCheck([check])?.conflictCheckId).toBe(check.conflictCheckId);
    expect(formatConflictSimilarity(0.625)).toBe('63%');
    expect(formatConflictSimilarity(91)).toBe('91%');
    expect(formatConflictSimilarity(Number.NaN)).toBe('-');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('createConflictChecksRequestCoordinator', () => {
  it('hides the previous Matter state before the new load effect runs', () => {
    const previousState = {
      ownerMatterId: matter.matterId,
      checks: [check],
      loadStatus: 'ready' as const,
    };

    expect(
      conflictChecksStateForMatter(previousState, '11111111-1111-4111-8111-111111111123'),
    ).toEqual({
      ownerMatterId: '11111111-1111-4111-8111-111111111123',
      checks: [],
      loadStatus: 'loading',
    });
  });

  it('keeps a new Matter loading while stale resolve and reject results are ignored', async () => {
    const coordinator = createConflictChecksRequestCoordinator();
    const first = deferred<ConflictCheckDto[]>();
    const second = deferred<ConflictCheckDto[]>();
    const third = deferred<ConflictCheckDto[]>();
    const firstRequest = coordinator.begin();
    const secondRequest = coordinator.begin();
    const state = { checks: [] as ConflictCheckDto[], loadStatus: 'loading' as ConflictLoadStatus };
    first.promise.then((checks) => {
      if (firstRequest.isCurrent()) state.checks = checks;
    });
    second.promise.catch(() => {
      if (secondRequest.isCurrent()) state.loadStatus = 'error';
    });
    const thirdRequest = coordinator.begin();
    third.promise.then((checks) => {
      if (thirdRequest.isCurrent()) {
        state.checks = checks;
        state.loadStatus = checks.length === 0 ? 'empty' : 'ready';
      }
    });

    first.resolve([check]);
    second.reject(new Error('stale failure'));
    await Promise.resolve();
    expect(state).toEqual({ checks: [], loadStatus: 'loading' });

    third.resolve([]);
    await Promise.resolve();
    expect(state).toEqual({ checks: [], loadStatus: 'empty' });
    expect(firstRequest.isCurrent()).toBe(false);
    expect(secondRequest.isCurrent()).toBe(false);
  });
});
