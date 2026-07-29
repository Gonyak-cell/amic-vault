'use client';

import React, { useEffect, useState } from 'react';
import { MatterWorkstreamTabs } from '@/components/matter/matter-workstream-tabs';
import {
  DdMatterReadOnlyView,
  type DdMatterReadOnlyData,
} from '@/components/matter/matter-workstream-readonly';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import {
  listDdIssues,
  listDdMappings,
  listDdRfis,
  listDdRisks,
  loadDdTraceability,
} from '@/lib/api/dd';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; data: DdMatterReadOnlyData }
  | { status: 'error'; message: string };

export default function MatterDdPage({ params }: { params: { matterId: string } }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    Promise.all([
      listDdRfis({ matterId: params.matterId, limit: 50 }),
      listDdMappings({ matterId: params.matterId, limit: 50 }),
      listDdIssues({ matterId: params.matterId, limit: 50 }),
      listDdRisks({ matterId: params.matterId, limit: 50 }),
      loadDdTraceability({ matterId: params.matterId, limit: 100 }),
    ])
      .then(([rfis, mappings, issues, risks, traceability]) => {
        if (!active) return;
        setState({
          status: 'ready',
          data: {
            issues: issues.issues,
            mappings: mappings.mappings,
            risks: risks.risks,
            rfis: rfis.rfis,
            traceability,
          },
        });
      })
      .catch((caught) => {
        if (!active) return;
        setState({ status: 'error', message: safeApiErrorMessage(caught) });
      });

    return () => {
      active = false;
    };
  }, [params.matterId]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter', 'DD']}
        title="DD"
        description="자료 요청 · 추적 관계"
      />

      <MatterWorkstreamTabs matterId={params.matterId} active="dd" />

      {state.status === 'loading' ? (
        <EmptyState variant="api-unavailable" title="DD 데이터를 불러오는 중입니다." />
      ) : null}
      {state.status === 'error' ? (
        <EmptyState
          variant="api-error"
          title="DD 데이터를 표시할 수 없습니다."
          description={state.message}
        />
      ) : null}
      {state.status === 'ready' ? <DdMatterReadOnlyView data={state.data} /> : null}
    </PageShell>
  );
}
