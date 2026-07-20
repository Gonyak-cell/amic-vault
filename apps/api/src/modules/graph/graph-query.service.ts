import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EvidencePackGraphFactDto,
  GraphEdgeType,
  GraphFactDto,
  GraphFactsResponseDto,
  GraphNeighborhoodResponseDto,
  PermissionContext,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';
import {
  SearchFilterBuilder,
  type SearchSqlFragment,
  type SearchSqlValue,
} from '../search/query/search-filter.builder';

interface GraphFactRow {
  edge_id: string;
  edge_type: GraphFactDto['edgeType'];
  matter_id: string;
  document_id: string | null;
  source_hash: string;
  source_node_id: string;
  source_node_type: GraphFactDto['source']['nodeType'];
  source_source_id: string;
  source_matter_id: string | null;
  source_document_id: string | null;
  source_version_id: string | null;
  source_provenance: GraphFactDto['source']['provenance'];
  source_review_status: GraphFactDto['source']['reviewStatus'];
  source_created_by_kind: GraphFactDto['source']['createdByKind'];
  target_node_id: string;
  target_node_type: GraphFactDto['target']['nodeType'];
  target_source_id: string;
  target_matter_id: string | null;
  target_document_id: string | null;
  target_version_id: string | null;
  target_provenance: GraphFactDto['target']['provenance'];
  target_review_status: GraphFactDto['target']['reviewStatus'];
  target_created_by_kind: GraphFactDto['target']['createdByKind'];
}

interface GraphNodeRow {
  node_id: string;
  node_type: GraphFactDto['source']['nodeType'];
  source_id: string;
  matter_id: string | null;
  document_id: string | null;
  version_id: string | null;
  provenance: GraphFactDto['source']['provenance'];
  review_status: GraphFactDto['source']['reviewStatus'];
  created_by_kind: GraphFactDto['source']['createdByKind'];
}

interface GraphNeighborhoodPathRow extends GraphFactRow {
  depth: number;
  node_ids: string[];
  edge_ids: string[];
}

interface GraphRootNodeRow {
  node_id: string;
  node_type: GraphFactDto['source']['nodeType'];
  source_id: string;
  matter_id: string | null;
}

export interface GraphFactsInput {
  matterId: string;
  documentId?: string | undefined;
  documentIds?: readonly string[] | undefined;
  limit?: number | undefined;
  scopeLabel?: 'graph_query' | 'ai_evidence_pack' | undefined;
}

export interface GraphNeighborhoodInput {
  nodeId: string;
  depth?: number | undefined;
  edgeTypes?: readonly GraphEdgeType[] | undefined;
  cursor?: number | undefined;
  limit?: number | undefined;
  scopeLabel?: 'graph_query' | 'ai_evidence_pack' | undefined;
}

export interface GraphDocumentNeighborhoodInput {
  matterId: string;
  documentIds: readonly string[];
  depth?: number | undefined;
  limit?: number | undefined;
  scopeLabel?: 'graph_query' | 'ai_evidence_pack' | undefined;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class GraphQueryService {
  private readonly logger = new Logger(GraphQueryService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
  ) {}

  async listFacts(
    ctx: PermissionContext,
    input: GraphFactsInput,
  ): Promise<GraphFactsResponseDto> {
    const startedAt = performance.now();
    const limit = Math.min(50, Math.max(1, input.limit ?? 20));
    const matterDecision = await this.permissionService.canReadMatter(ctx, input.matterId);
    if (matterDecision.effect !== 'ALLOW') {
      await this.recordQuery(ctx, input, 0, 'denied', startedAt, ['matter.read:denied']);
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      await this.recordQuery(ctx, input, 0, 'denied', startedAt, ['graph.permission_scope:error']);
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (scopeDecision.effect !== 'ALLOW') {
      await this.recordQuery(ctx, input, 0, 'denied', startedAt, ['graph.permission_scope:deny']);
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    try {
      const facts = await this.auditService.transaction(ctx.tenantId, async (client) => {
        const matterFacts = await client.query<GraphFactRow>(
          `
            SELECT ${factSelectSql()}
            FROM graph_edges ge
            JOIN graph_nodes source_node
              ON source_node.tenant_id = ge.tenant_id
              AND source_node.node_id = ge.source_node_id
            JOIN graph_nodes target_node
              ON target_node.tenant_id = ge.tenant_id
              AND target_node.node_id = ge.target_node_id
            WHERE ge.tenant_id = $1
              AND ge.matter_id = $2
              AND ge.edge_type = 'HAS_MATTER'
              AND ge.stale = false
              AND source_node.stale = false
              AND target_node.stale = false
            ORDER BY ge.edge_type, ge.edge_id
            LIMIT 1
          `,
          [ctx.tenantId, input.matterId],
        );
        const documentFacts = await this.queryDocumentFacts(
          client,
          scopeDecision.scope,
          input,
          Math.max(0, limit - matterFacts.rows.length),
        );
        const output = [...matterFacts.rows, ...documentFacts].slice(0, limit).map(toGraphFact);
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'GRAPH_QUERY_EXECUTED',
            targetType: 'graph_query',
            targetId: input.matterId,
            matterId: input.matterId,
            metadata: {
              matter_id: input.matterId,
              graph_scope: input.scopeLabel ?? 'graph_query',
              query_hash: sha256Hex(
                `${input.matterId}:${input.documentId ?? ''}:${input.documentIds?.join(',') ?? ''}`,
              ),
              result_count: output.length,
              filter_refs: compactRules(scopeDecision.appliedRules ?? []),
              duration_ms: Math.round(performance.now() - startedAt),
            },
          },
          client,
        );
        return output;
      });

      return { matterId: input.matterId, facts };
    } catch (error) {
      this.logger.warn({ code: 'GRAPH_QUERY_FAILED', matterId: input.matterId });
      throw error;
    }
  }

  async listNeighborhood(
    ctx: PermissionContext,
    input: GraphNeighborhoodInput,
  ): Promise<GraphNeighborhoodResponseDto> {
    const startedAt = performance.now();
    const depth = Math.min(3, Math.max(1, input.depth ?? 1));
    const limit = Math.min(200, Math.max(1, input.limit ?? 200));
    const cursor = Math.max(0, input.cursor ?? 0);
    const root = await this.findRootNode(ctx, input.nodeId);
    const matterId = root?.matter_id ?? (root?.node_type === 'matter' ? root.source_id : null);
    if (!root || !matterId) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    const matterDecision = await this.permissionService.canReadMatter(ctx, matterId);
    if (matterDecision.effect !== 'ALLOW') {
      await this.recordNeighborhoodQuery(ctx, matterId, input, 0, 'denied', startedAt, [
        'matter.read:denied',
      ]);
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    const scopeDecision = await this.safeScopeDecision(ctx, matterId, input, startedAt);
    if (scopeDecision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    try {
      return await this.auditService.transaction(ctx.tenantId, async (client) => {
        const rows = await this.queryNeighborhoodRows(client, scopeDecision.scope, {
          tenantId: ctx.tenantId,
          matterId,
          nodeId: root.node_id,
          depth,
          edgeTypes: input.edgeTypes,
          cursor,
          limit: limit + 1,
        });
        const hasNext = rows.length > limit;
        const pageRows = rows.slice(0, limit);
        const nodeIds = [
          ...new Set([root.node_id, ...pageRows.flatMap((row) => row.node_ids)]),
        ].slice(0, 400);
        const nodeRows = await this.queryNodesById(client, ctx.tenantId, nodeIds);
        const output = {
          matterId,
          rootNodeId: root.node_id,
          depth,
          nodes: nodeRows.map(toGraphNodeRef),
          edges: uniqueFacts(pageRows.map(toGraphFact)),
          paths: pageRows.map((row) => ({
            depth: row.depth,
            nodeIds: row.node_ids,
            edgeIds: row.edge_ids,
          })),
          nextCursor: hasNext ? String(cursor + limit) : null,
        };
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'GRAPH_QUERY_EXECUTED',
            targetType: 'graph_query',
            targetId: matterId,
            matterId,
            metadata: {
              matter_id: matterId,
              graph_scope: input.scopeLabel ?? 'graph_query',
              query_hash: sha256Hex(
                `${root.node_id}:${depth}:${input.edgeTypes?.join(',') ?? ''}:${cursor}`,
              ),
              result_count: output.edges.length,
              filter_refs: compactRules(scopeDecision.appliedRules ?? []),
              duration_ms: Math.round(performance.now() - startedAt),
            },
          },
          client,
        );
        return output;
      });
    } catch (error) {
      this.logger.warn({ code: 'GRAPH_NEIGHBORHOOD_QUERY_FAILED', nodeId: input.nodeId });
      throw error;
    }
  }

  async listNeighborhoodFactsForDocuments(
    ctx: PermissionContext,
    input: GraphDocumentNeighborhoodInput,
  ): Promise<GraphFactsResponseDto> {
    const rootNodeId = await this.findFirstDocumentNode(ctx, input.matterId, input.documentIds);
    if (!rootNodeId) {
      return this.listFacts(ctx, {
        matterId: input.matterId,
        documentIds: input.documentIds,
        limit: input.limit,
        scopeLabel: input.scopeLabel,
      });
    }
    const neighborhood = await this.listNeighborhood(ctx, {
      nodeId: rootNodeId,
      depth: input.depth ?? 2,
      limit: input.limit,
      scopeLabel: input.scopeLabel,
    });
    return {
      matterId: neighborhood.matterId,
      facts: neighborhood.edges.slice(0, input.limit ?? 20),
    };
  }

  toEvidencePackFacts(facts: readonly GraphFactDto[]): EvidencePackGraphFactDto[] {
    return facts.slice(0, 20).map((fact) => ({
      edgeId: fact.edgeId,
      edgeType: fact.edgeType,
      matterId: fact.matterId,
      documentId: fact.documentId,
      sourceNodeId: fact.source.nodeId,
      sourceNodeType: fact.source.nodeType,
      sourceProvenance: fact.source.provenance,
      sourceReviewStatus: fact.source.reviewStatus,
      sourceCreatedByKind: fact.source.createdByKind,
      targetNodeId: fact.target.nodeId,
      targetNodeType: fact.target.nodeType,
      targetProvenance: fact.target.provenance,
      targetReviewStatus: fact.target.reviewStatus,
      targetCreatedByKind: fact.target.createdByKind,
      sourceHash: fact.sourceHash,
    }));
  }

  private async queryDocumentFacts(
    client: { query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> },
    scope: SearchSqlFragment,
    input: GraphFactsInput,
    limit: number,
  ): Promise<GraphFactRow[]> {
    if (limit <= 0) return [];
    const filters = this.filterBuilder.build({
      filters: { matterId: input.matterId },
      scope,
    });
    const documentIds = [
      ...new Set([...(input.documentIds ?? []), input.documentId].filter(isString)),
    ];
    const params: SearchSqlValue[] = [...filters.params];
    const documentFilter =
      documentIds.length > 0
        ? `AND ge.document_id = ANY($${params.push(documentIds)}::uuid[])`
        : '';
    const sql = `
      WITH idx AS (
        SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
          d.document_type, d.status AS document_status, dv.version_status, d.updated_at
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
      )
      SELECT ${factSelectSql()}
      FROM graph_edges ge
      JOIN graph_nodes source_node
        ON source_node.tenant_id = ge.tenant_id
        AND source_node.node_id = ge.source_node_id
      JOIN graph_nodes target_node
        ON target_node.tenant_id = ge.tenant_id
        AND target_node.node_id = ge.target_node_id
      JOIN idx
        ON idx.tenant_id = ge.tenant_id
        AND idx.matter_id = ge.matter_id
        AND idx.document_id = ge.document_id
      ${filters.whereSql}
        AND ge.edge_type <> 'HAS_MATTER'
        AND ge.stale = false
        AND source_node.stale = false
        AND target_node.stale = false
        ${documentFilter}
      ORDER BY ge.document_id, ge.edge_type, ge.edge_id
      LIMIT $${params.push(limit)}
    `;
    const result = await client.query<GraphFactRow>(sql, params);
    return result.rows;
  }

  private async findRootNode(
    ctx: PermissionContext,
    nodeId: string,
  ): Promise<GraphRootNodeRow | null> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<GraphRootNodeRow>(
        `
          SELECT node_id, node_type, source_id, matter_id
          FROM graph_nodes
          WHERE tenant_id = $1
            AND node_id = $2
            AND stale = false
          LIMIT 1
        `,
        [ctx.tenantId, nodeId],
      );
      return result.rows[0] ?? null;
    });
  }

  private async findFirstDocumentNode(
    ctx: PermissionContext,
    matterId: string,
    documentIds: readonly string[],
  ): Promise<string | null> {
    if (documentIds.length === 0) return null;
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<{ node_id: string }>(
        `
          SELECT node_id
          FROM graph_nodes
          WHERE tenant_id = $1
            AND matter_id = $2
            AND node_type = 'document'
            AND source_id = ANY($3::uuid[])
            AND stale = false
          ORDER BY source_id
          LIMIT 1
        `,
        [ctx.tenantId, matterId, [...new Set(documentIds)]],
      );
      return result.rows[0]?.node_id ?? null;
    });
  }

  private async safeScopeDecision(
    ctx: PermissionContext,
    matterId: string,
    input: Pick<GraphNeighborhoodInput, 'nodeId' | 'depth' | 'edgeTypes' | 'scopeLabel'>,
    startedAt: number,
  ): Promise<Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>> {
    try {
      const scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
      if (scopeDecision.effect !== 'ALLOW') {
        await this.recordNeighborhoodQuery(ctx, matterId, input, 0, 'denied', startedAt, [
          'graph.permission_scope:deny',
        ]);
      }
      return scopeDecision;
    } catch {
      await this.recordNeighborhoodQuery(ctx, matterId, input, 0, 'denied', startedAt, [
        'graph.permission_scope:error',
      ]);
      return { effect: 'DENY', reasonCode: 'SCOPE_ERROR' };
    }
  }

  private async queryNeighborhoodRows(
    client: { query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> },
    scope: SearchSqlFragment,
    input: {
      tenantId: string;
      matterId: string;
      nodeId: string;
      depth: number;
      edgeTypes?: readonly GraphEdgeType[] | undefined;
      cursor: number;
      limit: number;
    },
  ): Promise<GraphNeighborhoodPathRow[]> {
    const filters = this.filterBuilder.build({
      filters: { matterId: input.matterId, versionStatus: 'all' },
      scope,
    });
    const params: SearchSqlValue[] = [...filters.params];
    const tenantParam = params.push(input.tenantId);
    const matterParam = params.push(input.matterId);
    const rootParam = params.push(input.nodeId);
    const depthParam = params.push(input.depth);
    const edgeTypes = input.edgeTypes ? [...new Set(input.edgeTypes)] : [];
    const edgeTypeFilter =
      edgeTypes.length > 0 ? `AND ge.edge_type = ANY($${params.push(edgeTypes)}::text[])` : '';
    const cursorParam = params.push(input.cursor);
    const limitParam = params.push(input.limit);
    const sql = `
      WITH RECURSIVE idx AS (
        SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
          d.document_type, d.status AS document_status, dv.version_status, d.updated_at
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
      ),
      allowed_documents AS (
        SELECT idx.document_id
        FROM idx
        ${filters.whereSql}
      ),
      walk AS (
        SELECT
          0::integer AS depth,
          root.node_id,
          ARRAY[root.node_id]::uuid[] AS node_ids,
          ARRAY[]::uuid[] AS edge_ids
        FROM graph_nodes root
        WHERE root.tenant_id = $${tenantParam}
          AND root.node_id = $${rootParam}
          AND root.stale = false
        UNION ALL
        SELECT
          walk.depth + 1 AS depth,
          next_node.node_id,
          walk.node_ids || next_node.node_id,
          walk.edge_ids || ge.edge_id
        FROM walk
        JOIN graph_edges ge
          ON ge.tenant_id = $${tenantParam}
          AND ge.matter_id = $${matterParam}
          AND ge.stale = false
          AND (ge.source_node_id = walk.node_id OR ge.target_node_id = walk.node_id)
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
          AND source_node.node_id = ge.source_node_id
          AND source_node.stale = false
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
          AND target_node.node_id = ge.target_node_id
          AND target_node.stale = false
        JOIN graph_nodes next_node
          ON next_node.tenant_id = ge.tenant_id
          AND next_node.node_id = CASE
            WHEN ge.source_node_id = walk.node_id THEN ge.target_node_id
            ELSE ge.source_node_id
          END
          AND next_node.stale = false
        WHERE walk.depth < $${depthParam}
          ${edgeTypeFilter}
          AND NOT next_node.node_id = ANY(walk.node_ids)
          AND (ge.document_id IS NULL OR ge.document_id IN (SELECT document_id FROM allowed_documents))
          AND (
            source_node.document_id IS NULL
            OR source_node.document_id IN (SELECT document_id FROM allowed_documents)
          )
          AND (
            target_node.document_id IS NULL
            OR target_node.document_id IN (SELECT document_id FROM allowed_documents)
          )
      ),
      path_edges AS (
        SELECT DISTINCT ON (ge.edge_id)
          walk.depth,
          walk.node_ids,
          walk.edge_ids,
          ${factSelectSql()}
        FROM walk
        JOIN graph_edges ge
          ON ge.tenant_id = $${tenantParam}
          AND ge.edge_id = walk.edge_ids[array_length(walk.edge_ids, 1)]
          AND ge.stale = false
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
          AND source_node.node_id = ge.source_node_id
          AND source_node.stale = false
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
          AND target_node.node_id = ge.target_node_id
          AND target_node.stale = false
        WHERE walk.depth > 0
        ORDER BY ge.edge_id, walk.depth
      )
      SELECT *
      FROM path_edges
      ORDER BY depth, edge_type, edge_id
      OFFSET $${cursorParam}
      LIMIT $${limitParam}
    `;
    const result = await client.query<GraphNeighborhoodPathRow>(sql, params);
    return result.rows;
  }

  private async queryNodesById(
    client: { query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> },
    tenantId: string,
    nodeIds: readonly string[],
  ): Promise<GraphNodeRow[]> {
    if (nodeIds.length === 0) return [];
    const result = await client.query<GraphNodeRow>(
      `
        SELECT node_id, node_type, source_id, matter_id, document_id, version_id,
          provenance, review_status, created_by_kind
        FROM graph_nodes
        WHERE tenant_id = $1
          AND node_id = ANY($2::uuid[])
          AND stale = false
        ORDER BY array_position($2::uuid[], node_id)
      `,
      [tenantId, nodeIds],
    );
    return result.rows;
  }

  private async recordQuery(
    ctx: PermissionContext,
    input: GraphFactsInput,
    resultCount: number,
    result: 'success' | 'denied' | 'failure',
    startedAt: number,
    rules: readonly string[],
  ): Promise<void> {
    await this.auditService.log({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      sessionId: ctx.sessionId ?? null,
      action: 'GRAPH_QUERY_EXECUTED',
      targetType: 'graph_query',
      targetId: input.matterId,
      matterId: input.matterId,
      result,
      metadata: {
        matter_id: input.matterId,
        graph_scope: input.scopeLabel ?? 'graph_query',
        query_hash: sha256Hex(`${input.matterId}:${input.documentId ?? ''}`),
        result_count: resultCount,
        filter_refs: compactRules(rules),
        duration_ms: Math.round(performance.now() - startedAt),
      },
    });
  }

  private async recordNeighborhoodQuery(
    ctx: PermissionContext,
    matterId: string,
    input: Pick<GraphNeighborhoodInput, 'nodeId' | 'depth' | 'edgeTypes' | 'scopeLabel'>,
    resultCount: number,
    result: 'success' | 'denied' | 'failure',
    startedAt: number,
    rules: readonly string[],
  ): Promise<void> {
    await this.auditService.log({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      sessionId: ctx.sessionId ?? null,
      action: 'GRAPH_QUERY_EXECUTED',
      targetType: 'graph_query',
      targetId: matterId,
      matterId,
      result,
      metadata: {
        matter_id: matterId,
        graph_scope: input.scopeLabel ?? 'graph_query',
        query_hash: sha256Hex(
          `${input.nodeId}:${input.depth ?? ''}:${input.edgeTypes?.join(',') ?? ''}`,
        ),
        result_count: resultCount,
        filter_refs: compactRules(rules),
        duration_ms: Math.round(performance.now() - startedAt),
      },
    });
  }
}

function factSelectSql(): string {
  return `
    ge.edge_id,
    ge.edge_type,
    ge.matter_id,
    ge.document_id,
    ge.source_hash,
    source_node.node_id AS source_node_id,
    source_node.node_type AS source_node_type,
    source_node.source_id AS source_source_id,
    source_node.matter_id AS source_matter_id,
    source_node.document_id AS source_document_id,
    source_node.version_id AS source_version_id,
    source_node.provenance AS source_provenance,
    source_node.review_status AS source_review_status,
    source_node.created_by_kind AS source_created_by_kind,
    target_node.node_id AS target_node_id,
    target_node.node_type AS target_node_type,
    target_node.source_id AS target_source_id,
    target_node.matter_id AS target_matter_id,
    target_node.document_id AS target_document_id,
    target_node.version_id AS target_version_id,
    target_node.provenance AS target_provenance,
    target_node.review_status AS target_review_status,
    target_node.created_by_kind AS target_created_by_kind
  `;
}

function toGraphFact(row: GraphFactRow): GraphFactDto {
  return {
    edgeId: row.edge_id,
    edgeType: row.edge_type,
    matterId: row.matter_id,
    documentId: row.document_id,
    sourceHash: row.source_hash,
    source: {
      nodeId: row.source_node_id,
      nodeType: row.source_node_type,
      sourceId: row.source_source_id,
      matterId: row.source_matter_id,
      documentId: row.source_document_id,
      versionId: row.source_version_id,
      provenance: row.source_provenance,
      reviewStatus: row.source_review_status,
      createdByKind: row.source_created_by_kind,
    },
    target: {
      nodeId: row.target_node_id,
      nodeType: row.target_node_type,
      sourceId: row.target_source_id,
      matterId: row.target_matter_id,
      documentId: row.target_document_id,
      versionId: row.target_version_id,
      provenance: row.target_provenance,
      reviewStatus: row.target_review_status,
      createdByKind: row.target_created_by_kind,
    },
  };
}

function toGraphNodeRef(row: GraphNodeRow): GraphFactDto['source'] {
  return {
    nodeId: row.node_id,
    nodeType: row.node_type,
    sourceId: row.source_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    provenance: row.provenance,
    reviewStatus: row.review_status,
    createdByKind: row.created_by_kind,
  };
}

function uniqueFacts(facts: readonly GraphFactDto[]): GraphFactDto[] {
  const seen = new Set<string>();
  const output: GraphFactDto[] = [];
  for (const fact of facts) {
    if (seen.has(fact.edgeId)) continue;
    seen.add(fact.edgeId);
    output.push(fact);
  }
  return output;
}

function compactRules(rules: readonly string[]): string {
  return [...new Set(rules)].slice(0, 12).join(',').slice(0, 256);
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
