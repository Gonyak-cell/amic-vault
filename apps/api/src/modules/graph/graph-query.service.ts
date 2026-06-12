import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EvidencePackGraphFactDto,
  GraphFactDto,
  GraphFactsResponseDto,
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
  target_node_id: string;
  target_node_type: GraphFactDto['target']['nodeType'];
  target_source_id: string;
  target_matter_id: string | null;
  target_document_id: string | null;
  target_version_id: string | null;
}

export interface GraphFactsInput {
  matterId: string;
  documentId?: string | undefined;
  documentIds?: readonly string[] | undefined;
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

  toEvidencePackFacts(facts: readonly GraphFactDto[]): EvidencePackGraphFactDto[] {
    return facts.slice(0, 20).map((fact) => ({
      edgeId: fact.edgeId,
      edgeType: fact.edgeType,
      matterId: fact.matterId,
      documentId: fact.documentId,
      sourceNodeId: fact.source.nodeId,
      sourceNodeType: fact.source.nodeType,
      targetNodeId: fact.target.nodeId,
      targetNodeType: fact.target.nodeType,
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
      documentIds.length > 0 ? `AND ge.document_id = ANY($${params.push(documentIds)}::uuid[])` : '';
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
    target_node.node_id AS target_node_id,
    target_node.node_type AS target_node_type,
    target_node.source_id AS target_source_id,
    target_node.matter_id AS target_matter_id,
    target_node.document_id AS target_document_id,
    target_node.version_id AS target_version_id
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
    },
    target: {
      nodeId: row.target_node_id,
      nodeType: row.target_node_type,
      sourceId: row.target_source_id,
      matterId: row.target_matter_id,
      documentId: row.target_document_id,
      versionId: row.target_version_id,
    },
  };
}

function compactRules(rules: readonly string[]): string {
  return [...new Set(rules)].slice(0, 12).join(',').slice(0, 256);
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
