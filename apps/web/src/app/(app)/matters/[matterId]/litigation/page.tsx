'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { EvidenceForm } from '@/components/litigation/evidence-form';
import { FactLedgerForm } from '@/components/litigation/fact-ledger-form';
import { HearingList } from '@/components/litigation/hearing-list';
import { MatterWorkstreamTabs } from '@/components/matter/matter-workstream-tabs';
import {
  LitigationMatterReadOnlyView,
  type LitigationMatterReadOnlyData,
} from '@/components/matter/matter-workstream-readonly';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import {
  listLitigationEvidence,
  listLitigationFacts,
  listLitigationHearings,
  listLitigationIssues,
  listLitigationPleadings,
  loadLitigationCaseMap,
} from '@/lib/api/litigation';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; data: LitigationMatterReadOnlyData }
  | { status: 'error'; message: string };

export default function MatterLitigationPage({ params }: { params: { matterId: string } }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  const loadData = useCallback(
    async (active: () => boolean = () => true) => {
      const [evidence, facts, hearings, issues, pleadings, caseMap] = await Promise.all([
        listLitigationEvidence({ matterId: params.matterId, limit: 50 }),
        listLitigationFacts({ matterId: params.matterId, limit: 50 }),
        listLitigationHearings({ matterId: params.matterId, limit: 50 }),
        listLitigationIssues({ matterId: params.matterId, limit: 50 }),
        listLitigationPleadings({ matterId: params.matterId, limit: 50 }),
        loadLitigationCaseMap({ matterId: params.matterId, limit: 100 }),
      ]);
      if (!active()) return;
      setState({
        status: 'ready',
        data: {
          caseMap,
          evidence: evidence.evidence,
          facts: facts.facts,
          hearings: hearings.hearings,
          issues: issues.issues,
          pleadings: pleadings.pleadings,
        },
      });
    },
    [params.matterId],
  );

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    void loadData(() => active).catch((caught) => {
      if (!active) return;
      setState({ status: 'error', message: safeApiErrorMessage(caught) });
    });

    return () => {
      active = false;
    };
  }, [loadData]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter', '송무']}
        title="송무"
        description="사실관계 원장 · 사건 지도"
      />

      <MatterWorkstreamTabs matterId={params.matterId} active="litigation" />

      {state.status === 'loading' ? (
        <EmptyState variant="api-unavailable" title="송무 데이터를 불러오는 중입니다." />
      ) : null}
      {state.status === 'error' ? (
        <EmptyState
          variant="api-error"
          title="송무 데이터를 표시할 수 없습니다."
          description={state.message}
        />
      ) : null}
      {state.status === 'ready' ? (
        <div className="grid gap-5">
          <EvidenceForm matterId={params.matterId} onChanged={() => loadData()} />
          <FactLedgerForm
            evidence={state.data.evidence}
            facts={state.data.facts}
            matterId={params.matterId}
            onChanged={() => loadData()}
          />
          <HearingList
            hearings={state.data.hearings}
            matterId={params.matterId}
            onChanged={() => loadData()}
          />
          <LitigationMatterReadOnlyView data={state.data} />
        </div>
      ) : null}
    </PageShell>
  );
}
