'use client';

import React, { useEffect, useState } from 'react';
import { MatterWorkstreamTabs } from '@/components/matter/matter-workstream-tabs';
import {
  ContractMatterReadOnlyView,
  type ContractMatterReadOnlyData,
} from '@/components/matter/matter-workstream-readonly';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import {
  acceptContractAiReviewFinding,
  listContractClauseBank,
  listContractAiReviewFindings,
  listContractRuleFindings,
  listNegotiationIssues,
  updateNegotiationIssueStatus,
} from '@/lib/api/contract-intel';
import { listMatterDocuments, updateDocumentStatus } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import type { DocumentStatus, NegotiationIssueStatus } from '@amic-vault/shared';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; data: ContractMatterReadOnlyData }
  | { status: 'error'; message: string };

export default function MatterContractsPage({ params }: { params: { matterId: string } }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [acceptingAiFindingId, setAcceptingAiFindingId] = useState<string | null>(null);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    Promise.all([
      listContractRuleFindings({ matterId: params.matterId, limit: 20 }),
      listContractAiReviewFindings({ matterId: params.matterId, limit: 50 }),
      listContractClauseBank({ matterId: params.matterId, limit: 50 }),
      listNegotiationIssues({ matterId: params.matterId, limit: 50 }),
      listMatterDocuments(params.matterId, {
        documentType: 'contract',
        pageSize: 50,
        sortBy: 'updated_desc',
      }),
    ])
      .then(([findings, aiReviewFindings, clauses, issues, documents]) => {
        if (!active) return;
        setState({
          status: 'ready',
          data: {
            aiReviewFindings: aiReviewFindings.findings,
            clauses: clauses.clauses,
            documents: documents.items,
            findings: findings.findings,
            issues: issues.issues,
            unsupportedRuleCount: findings.unsupportedRuleCount,
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

  async function updateWorkflowStatus(documentId: string, status: DocumentStatus) {
    if (state.status !== 'ready') return;
    setUpdatingDocumentId(documentId);
    try {
      const updated = await updateDocumentStatus(documentId, { status });
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          data: {
            ...current.data,
            documents: current.data.documents.map((document) =>
              document.documentId === updated.documentId ? updated : document,
            ),
          },
        };
      });
    } catch (caught) {
      setState({ status: 'error', message: safeApiErrorMessage(caught) });
    } finally {
      setUpdatingDocumentId(null);
    }
  }

  async function acceptAiReviewFinding(findingId: string) {
    if (state.status !== 'ready') return;
    setAcceptingAiFindingId(findingId);
    try {
      const updated = await acceptContractAiReviewFinding(findingId);
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          data: {
            ...current.data,
            aiReviewFindings: current.data.aiReviewFindings.map((finding) =>
              finding.findingId === updated.findingId ? updated : finding,
            ),
          },
        };
      });
    } catch (caught) {
      setState({ status: 'error', message: safeApiErrorMessage(caught) });
    } finally {
      setAcceptingAiFindingId(null);
    }
  }

  async function updateIssueStatus(issueId: string, status: NegotiationIssueStatus) {
    if (state.status !== 'ready') return;
    setUpdatingIssueId(issueId);
    try {
      const updated = await updateNegotiationIssueStatus(issueId, { status });
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          data: {
            ...current.data,
            issues: current.data.issues.map((issue) =>
              issue.issueId === updated.issueId ? updated : issue,
            ),
          },
        };
      });
    } catch (caught) {
      setState({ status: 'error', message: safeApiErrorMessage(caught) });
    } finally {
      setUpdatingIssueId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter', '계약']}
        title="계약 검토"
        description="조항 라이브러리 · 기준 검토 결과"
      />

      <MatterWorkstreamTabs matterId={params.matterId} active="contracts" />

      {state.status === 'loading' ? (
        <EmptyState variant="api-unavailable" title="계약 데이터를 불러오는 중입니다." />
      ) : null}
      {state.status === 'error' ? (
        <EmptyState
          variant="api-error"
          title="계약 데이터를 표시할 수 없습니다."
          description={state.message}
        />
      ) : null}
      {state.status === 'ready' ? (
        <ContractMatterReadOnlyView
          acceptingAiFindingId={acceptingAiFindingId}
          data={state.data}
          onAiReviewFindingAccept={(findingId) => void acceptAiReviewFinding(findingId)}
          onDocumentStatusChange={(documentId, status) =>
            void updateWorkflowStatus(documentId, status)
          }
          onNegotiationIssueStatusChange={(issueId, status) =>
            void updateIssueStatus(issueId, status)
          }
          updatingDocumentId={updatingDocumentId}
          updatingIssueId={updatingIssueId}
        />
      ) : null}
    </PageShell>
  );
}
