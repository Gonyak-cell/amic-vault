'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Download, GitBranch, Network, Quote, TriangleAlert } from 'lucide-react';
import type {
  AiSessionClaimsResponseDto,
  DdIssueDto,
  GraphFactDto,
  GraphNeighborhoodResponseDto,
  GraphNodeProvenance,
  LitigationIssueDto,
  MatterDashboardDto,
  MatterWikiListDto,
  MatterWikiPageDto,
  MatterWikiReviewStatus,
  MatterWikiSourceRefDto,
} from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { listDdIssues } from '@/lib/api/dd';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  getAiSessionClaims,
  listGraphFacts,
  listGraphNeighborhood,
} from '@/lib/api/graph';
import { listLitigationIssues } from '@/lib/api/litigation';
import { listMatterWiki, matterWikiExportUrl } from '@/lib/api/matter-wiki';

type GraphNodeRefDto = GraphFactDto['source'];

interface MatterKnowledgeData {
  claims: AiSessionClaimsResponseDto | null;
  ddIssues: DdIssueDto[];
  facts: GraphFactDto[];
  litigationIssues: LitigationIssueDto[];
  neighborhood: GraphNeighborhoodResponseDto | null;
  wiki: MatterWikiListDto;
}

type KnowledgeState =
  | { status: 'loading' }
  | { status: 'ready'; data: MatterKnowledgeData }
  | { status: 'error'; message: string };

export function MatterKnowledgeTab({
  initialData,
  initialError,
  latestSessionId,
  matterId,
}: {
  initialData?: MatterKnowledgeData;
  initialError?: string;
  latestSessionId?: string | null;
  matterId: string;
}) {
  const [state, setState] = useState<KnowledgeState>(
    initialData
      ? { status: 'ready', data: initialData }
      : initialError
        ? { status: 'error', message: initialError }
        : { status: 'loading' },
  );

  useEffect(() => {
    if (initialData || initialError) return;
    let active = true;
    setState({ status: 'loading' });
    loadMatterKnowledge(matterId, latestSessionId ?? null)
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((caught) => {
        if (active) setState({ status: 'error', message: safeApiErrorMessage(caught) });
      });
    return () => {
      active = false;
    };
  }, [initialData, initialError, latestSessionId, matterId]);

  return (
    <section id="matter-knowledge" className="grid gap-4" aria-label="Matter 지식">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">지식</h2>
          <p className="text-xs text-muted-foreground">Matter Graph · Issue Map · Citation Panel</p>
        </div>
      </div>

      {state.status === 'loading' ? (
        <EmptyState variant="api-unavailable" title="지식 데이터를 불러오는 중입니다." />
      ) : null}
      {state.status === 'error' ? (
        <EmptyState
          variant="api-error"
          title="지식 데이터를 표시할 수 없습니다."
          description={state.message}
        />
      ) : null}
      {state.status === 'ready' ? <MatterKnowledgeView data={state.data} matterId={matterId} /> : null}
    </section>
  );
}

async function loadMatterKnowledge(
  matterId: string,
  latestSessionId: string | null,
): Promise<MatterKnowledgeData> {
  const [factsResponse, ddIssues, litigationIssues, claims, wiki] = await Promise.all([
    listGraphFacts({ matterId, limit: 20 }),
    listDdIssues({ matterId, limit: 50 }),
    listLitigationIssues({ matterId, limit: 50 }),
    latestSessionId ? getAiSessionClaims(latestSessionId) : Promise.resolve(null),
    listMatterWiki(matterId),
  ]);
  const rootNodeId =
    factsResponse.facts[0]?.source.nodeId ?? factsResponse.facts[0]?.target.nodeId ?? null;
  const neighborhood = rootNodeId
    ? await listGraphNeighborhood({ nodeId: rootNodeId, depth: 1, limit: 100 })
    : null;
  return {
    claims,
    ddIssues: ddIssues.issues,
    facts: factsResponse.facts,
    litigationIssues: litigationIssues.issues,
    neighborhood,
    wiki,
  };
}

function MatterKnowledgeView({ data, matterId }: { data: MatterKnowledgeData; matterId: string }) {
  const issueCount = data.litigationIssues.length + data.ddIssues.length;
  const graphNodes = data.neighborhood?.nodes ?? uniqueFactNodes(data.facts);
  const nodeCount = graphNodes.length;
  return (
    <div className="grid gap-4">
      <KnowledgeSubtabs
        claimCount={data.claims ? data.claims.claims.length : 0}
        factCount={data.facts.length}
        issueCount={issueCount}
        wikiCount={data.wiki.pages.length}
      />
      <MetricStrip
        items={[
          { label: 'Facts', value: data.facts.length },
          { label: 'Nodes', value: nodeCount },
          { label: 'Issues', value: issueCount },
          { label: 'Wiki', value: data.wiki.pages.length },
        ]}
      />
      <MatterGraphPanel facts={data.facts} neighborhood={data.neighborhood} />
      <IssueMapPanel ddIssues={data.ddIssues} litigationIssues={data.litigationIssues} />
      <CitationPanel claims={data.claims} />
      <MatterWikiPanel graphNodes={graphNodes} matterId={matterId} wiki={data.wiki} />
    </div>
  );
}

function KnowledgeSubtabs({
  claimCount,
  factCount,
  issueCount,
  wikiCount,
}: {
  claimCount: number;
  factCount: number;
  issueCount: number;
  wikiCount: number;
}) {
  const items = [
    { href: '#matter-graph', label: 'Graph', value: factCount },
    { href: '#matter-issues', label: 'Issues', value: issueCount },
    { href: '#matter-citations', label: 'Citations', value: claimCount },
    { href: '#matter-wiki', label: 'Wiki', value: wikiCount },
  ];
  return (
    <nav aria-label="Matter 지식 서브탭" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <a
          key={item.href}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted"
          href={item.href}
        >
          <span>{item.label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{item.value}</span>
        </a>
      ))}
    </nav>
  );
}

function MatterGraphPanel({
  facts,
  neighborhood,
}: {
  facts: GraphFactDto[];
  neighborhood: GraphNeighborhoodResponseDto | null;
}) {
  const nodes = neighborhood?.nodes ?? uniqueFactNodes(facts);
  return (
    <SectionCard
      id="matter-graph"
      icon={<Network className="h-4 w-4" />}
      title="Matter Graph"
      meta={`${nodes.length} nodes`}
    >
      {facts.length === 0 ? (
        <EmptyState title="표시할 그래프 Fact가 없습니다." />
      ) : (
        <div className="grid gap-3">
          <GraphStrip nodes={nodes} edgeCount={facts.length} />
          <GraphNodeDirectory nodes={nodes} />
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Matter Graph fact 목록</caption>
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <TableHeader>Source</TableHeader>
                  <TableHeader>Edge</TableHeader>
                  <TableHeader>Target</TableHeader>
                  <TableHeader>Document</TableHeader>
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => (
                  <tr key={fact.edgeId} className="border-t">
                    <TableCell>
                      <NodeLabel node={fact.source} />
                    </TableCell>
                    <TableCell>
                      <code className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">
                        {fact.edgeType}
                      </code>
                    </TableCell>
                    <TableCell>
                      <NodeLabel node={fact.target} />
                    </TableCell>
                    <TableCell>
                      <DocumentLink node={fact.target} fallback={fact.documentId} />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function IssueMapPanel({
  ddIssues,
  litigationIssues,
}: {
  ddIssues: DdIssueDto[];
  litigationIssues: LitigationIssueDto[];
}) {
  return (
    <SectionCard
      id="matter-issues"
      icon={<GitBranch className="h-4 w-4" />}
      title="Issue Map"
      meta="송무 · DD"
    >
      {ddIssues.length + litigationIssues.length === 0 ? (
        <EmptyState title="표시할 Issue가 없습니다." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <IssueList
            caption="송무 issue tree"
            items={litigationIssues
              .slice()
              .sort((left, right) => left.position - right.position)
              .map((issue) => ({
                id: issue.issueId,
                parentId: issue.parentIssueId,
                label: issue.issueCode,
                title: issue.label,
                status: issue.status,
                tone: statusTone(issue.status),
              }))}
          />
          <IssueList
            caption="DD issue 목록"
            items={ddIssues.map((issue) => ({
              id: issue.issueId,
              parentId: issue.rfiId,
              label: issue.issueCode,
              title: issue.title,
              status: issue.severity,
              tone: severityTone(issue.severity),
            }))}
          />
        </div>
      )}
    </SectionCard>
  );
}

function CitationPanel({ claims }: { claims: AiSessionClaimsResponseDto | null }) {
  return (
    <SectionCard
      id="matter-citations"
      icon={<Quote className="h-4 w-4" />}
      title="Citation Panel"
      meta={claims ? `${claims.claims.length} claims` : '최근 AI 세션 없음'}
    >
      {!claims || claims.claims.length === 0 ? (
        <EmptyState title="표시할 Citation 원장이 없습니다." />
      ) : (
        <div className="grid gap-3">
          {claims.claims.map((claim) => (
            <article key={claim.claimId} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge tone={claim.verificationStatus === 'cited' ? 'success' : 'warning'}>
                    {claim.verificationStatus}
                  </StatusBadge>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {claim.kind}
                  </code>
                </div>
                {claim.isLegalConclusion ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    법률판단 검토
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6">{claim.claimText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {claim.citations.map((citation, index) => (
                  <Link
                    key={citation.sourceRef}
                    className="rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
                    href={`/documents/${encodeURIComponent(citation.documentId)}?chunk=${index + 1}`}
                  >
                    인용 {index + 1}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function MatterWikiPanel({
  graphNodes,
  matterId,
  wiki,
}: {
  graphNodes: GraphNodeRefDto[];
  matterId: string;
  wiki: MatterWikiListDto;
}) {
  const confirmedCount = wiki.pages.filter((page) => page.reviewStatus === 'confirmed').length;
  return (
    <SectionCard
      id="matter-wiki"
      icon={<BookOpen className="h-4 w-4" />}
      title="위키"
      meta={`${wiki.pages.length} pages · ${confirmedCount} confirmed`}
      actions={
        <Button asChild size="sm" variant="outline">
          <a href={matterWikiExportUrl(matterId)}>
            <Download className="h-3.5 w-3.5" />
            내보내기
          </a>
        </Button>
      }
    >
      {wiki.pages.length === 0 ? (
        <EmptyState title="표시할 위키 페이지가 없습니다." />
      ) : (
        <div className="grid gap-3">
          {wiki.pages.map((page) => (
            <article key={page.pageId} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{page.title}</h3>
                  <p className="text-xs text-muted-foreground">{page.pageKind}</p>
                </div>
                <StatusBadge tone={wikiStatusTone(page.reviewStatus)}>
                  {wikiStatusLabel(page.reviewStatus)}
                </StatusBadge>
              </div>
              <WikiMarkdown graphNodes={graphNodes} matterId={matterId} page={page} />
              <WikiSourceRefs graphNodes={graphNodes} matterId={matterId} refs={page.sourceRefs} />
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function WikiMarkdown({
  graphNodes,
  matterId,
  page,
}: {
  graphNodes: GraphNodeRefDto[];
  matterId: string;
  page: MatterWikiPageDto;
}) {
  const lines = page.markdownBody.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return (
    <div className="mt-3 grid gap-2 text-sm leading-6">
      {lines.map((line, index) => {
        const key = `${page.pageId}-${index}`;
        if (line.startsWith('# ')) {
          return (
            <h4 key={key} className="text-sm font-semibold">
              {line.slice(2)}
            </h4>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <p key={key} className="pl-3 text-muted-foreground">
              • {renderWikiLinks(line.slice(2), page.sourceRefs, graphNodes, matterId)}
            </p>
          );
        }
        if (line.startsWith('[^')) {
          return (
            <p key={key} className="text-xs text-muted-foreground">
              {renderWikiLinks(line, page.sourceRefs, graphNodes, matterId)}
            </p>
          );
        }
        return <p key={key}>{renderWikiLinks(line, page.sourceRefs, graphNodes, matterId)}</p>;
      })}
    </div>
  );
}

function WikiSourceRefs({
  graphNodes,
  matterId,
  refs,
}: {
  graphNodes: GraphNodeRefDto[];
  matterId: string;
  refs: MatterWikiSourceRefDto[];
}) {
  if (refs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {refs.slice(0, 8).map((ref) => {
        const href = wikiRefHref(ref, graphNodes, matterId);
        const label = ref.sourceRef.length > 36 ? `${ref.sourceRef.slice(0, 33)}...` : ref.sourceRef;
        return href ? (
          <Link
            key={ref.sourceRef}
            className="rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
            href={href}
          >
            {label}
          </Link>
        ) : (
          <span
            key={ref.sourceRef}
            className="rounded-md border px-2 py-1 text-xs text-muted-foreground"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function renderWikiLinks(
  text: string,
  refs: readonly MatterWikiSourceRefDto[],
  graphNodes: readonly GraphNodeRefDto[],
  matterId: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/gu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index === undefined ? 0 : match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const target = match[1]?.trim() ?? '';
    const label = match[2]?.trim() || target;
    const href = resolveWikiLinkHref(target, refs, graphNodes, matterId);
    nodes.push(
      href ? (
        <Link key={`${target}-${index}`} className="text-primary hover:underline" href={href}>
          {label}
        </Link>
      ) : (
        <span key={`${target}-${index}`}>{label}</span>
      ),
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function resolveWikiLinkHref(
  target: string,
  refs: readonly MatterWikiSourceRefDto[],
  graphNodes: readonly GraphNodeRefDto[],
  matterId: string,
): string | null {
  const normalized = target.trim();
  const ref = refs.find(
    (item) =>
      item.sourceRef === normalized ||
      item.nodeId === normalized ||
      item.documentId === normalized ||
      item.versionId === normalized,
  );
  if (ref) return wikiRefHref(ref, graphNodes, matterId);
  const node = graphNodes.find((item) => item.nodeId === normalized || item.sourceId === normalized);
  return node ? graphNodeHref(matterId, node.nodeId) : null;
}

function wikiRefHref(
  ref: MatterWikiSourceRefDto,
  graphNodes: readonly GraphNodeRefDto[],
  matterId: string,
): string | null {
  if (ref.nodeId && graphNodes.some((node) => node.nodeId === ref.nodeId)) {
    return graphNodeHref(matterId, ref.nodeId);
  }
  if (ref.documentId) return `/documents/${encodeURIComponent(ref.documentId)}`;
  return null;
}

function graphNodeHref(matterId: string, nodeId: string): string {
  return `/matters/${encodeURIComponent(matterId)}#graph-node-${encodeURIComponent(nodeId)}`;
}

function MetricStrip({ items }: { items: readonly { label: string; value: number }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-card p-3">
          <dt className="text-xs font-medium uppercase text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GraphStrip({ nodes, edgeCount }: { edgeCount: number; nodes: GraphNodeRefDto[] }) {
  const visibleNodes = nodes.slice(0, 6);
  if (visibleNodes.length === 0) return null;
  return (
    <svg
      aria-label={`Matter graph preview with ${visibleNodes.length} nodes and ${edgeCount} edges`}
      className="h-20 w-full rounded-md border bg-muted/30"
      role="img"
      viewBox="0 0 600 80"
    >
      {visibleNodes.slice(1).map((node, index) => {
        const x1 = 48 + index * 96;
        const x2 = 48 + (index + 1) * 96;
        return (
          <line
            key={`edge-${node.nodeId}`}
            x1={x1}
            x2={x2}
            y1="40"
            y2="40"
            stroke="currentColor"
            strokeOpacity="0.2"
          />
        );
      })}
      {visibleNodes.map((node, index) => (
        <g key={node.nodeId} transform={`translate(${48 + index * 96} 40)`}>
          <circle r="14" className="fill-background stroke-primary/40" strokeWidth="2" />
          <text
            className="fill-muted-foreground text-[9px]"
            dominantBaseline="middle"
            textAnchor="middle"
            y="1"
          >
            {node.nodeType.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function GraphNodeDirectory({ nodes }: { nodes: GraphNodeRefDto[] }) {
  if (nodes.length === 0) return null;
  return (
    <div aria-label="Matter Graph node anchors" className="grid gap-2 sm:grid-cols-3">
      {nodes.slice(0, 9).map((node) => (
        <div
          key={node.nodeId}
          id={`graph-node-${node.nodeId}`}
          className="rounded-md border bg-background px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{node.nodeType}</span>
            <StatusBadge tone={provenanceTone(node.provenance)}>
              {provenanceLabel(node.provenance)}
            </StatusBadge>
          </div>
          <code className="mt-1 block truncate text-[11px] text-muted-foreground">
            {node.sourceId}
          </code>
        </div>
      ))}
    </div>
  );
}

function IssueList({
  caption,
  items,
}: {
  caption: string;
  items: readonly {
    id: string;
    label: string;
    parentId: string | null;
    status: string;
    title: string;
    tone: StatusBadgeTone;
  }[];
}) {
  if (items.length === 0) return <EmptyState title={`${caption}이 없습니다.`} />;
  return (
    <div className="rounded-md border" role="table" aria-label={caption}>
      {items.map((item) => (
        <div key={item.id} className="grid gap-1 border-t px-3 py-3 first:border-t-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">{item.title}</p>
            </div>
            <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
          </div>
          {item.parentId ? (
            <p className="text-xs text-muted-foreground">상위 {shortId(item.parentId)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function NodeLabel({ node }: { node: GraphNodeRefDto }) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{node.nodeType}</span>
        <StatusBadge tone={provenanceTone(node.provenance)}>
          {provenanceLabel(node.provenance)}
        </StatusBadge>
      </div>
      <code className="text-[11px] text-muted-foreground">{shortId(node.sourceId)}</code>
    </div>
  );
}

function DocumentLink({ fallback, node }: { fallback: string | null; node: GraphNodeRefDto }) {
  const documentId = node.documentId ?? fallback;
  if (!documentId) return <span className="text-muted-foreground">-</span>;
  return (
    <Link className="text-primary hover:underline" href={`/documents/${encodeURIComponent(documentId)}`}>
      문서 {shortId(documentId)}
    </Link>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function uniqueFactNodes(facts: readonly GraphFactDto[]): GraphNodeRefDto[] {
  const nodes = new Map<string, GraphNodeRefDto>();
  for (const fact of facts) {
    nodes.set(fact.source.nodeId, fact.source);
    nodes.set(fact.target.nodeId, fact.target);
  }
  return [...nodes.values()];
}

function provenanceLabel(value: GraphNodeProvenance): string {
  if (value === 'human_confirmed') return '[확정]';
  if (value === 'ai_proposed') return '[AI제안]';
  return '[파생]';
}

function provenanceTone(value: GraphNodeProvenance): StatusBadgeTone {
  if (value === 'human_confirmed') return 'success';
  if (value === 'ai_proposed') return 'warning';
  return 'neutral';
}

function severityTone(value: string): StatusBadgeTone {
  if (value === 'critical') return 'blocked';
  if (value === 'high' || value === 'medium') return 'warning';
  return 'neutral';
}

function statusTone(value: string): StatusBadgeTone {
  if (value === 'closed' || value === 'verified' || value === 'resolved') return 'success';
  if (value === 'blocked' || value === 'disputed' || value === 'withdrawn') return 'warning';
  return 'neutral';
}

function wikiStatusLabel(value: MatterWikiReviewStatus): string {
  if (value === 'confirmed') return 'confirmed';
  if (value === 'rejected') return 'rejected';
  return 'proposed';
}

function wikiStatusTone(value: MatterWikiReviewStatus): StatusBadgeTone {
  if (value === 'confirmed') return 'success';
  if (value === 'rejected') return 'blocked';
  return 'warning';
}

function shortId(value: string | null): string {
  if (!value) return '-';
  return value.length > 12 ? value.slice(0, 8) : value;
}

export type MatterKnowledgeInitialData = MatterKnowledgeData;
export type MatterKnowledgeDashboardSession = MatterDashboardDto['aiSessions'][number];
