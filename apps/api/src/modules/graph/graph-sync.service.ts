import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GraphEdgeType, GraphNodeType, GraphSyncResponseDto } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';

export interface GraphSyncContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface MatterSourceRow {
  matter_id: string;
  client_id: string;
}

interface DocumentSourceRow {
  document_id: string;
  version_id: string;
}

interface ClauseSourceRow {
  chunk_id: string;
  document_id: string;
  version_id: string;
  source_text_hash: string;
}

interface GraphNodeInput {
  nodeType: GraphNodeType;
  sourceTable: string;
  sourceId: string;
  matterId: string | null;
  documentId: string | null;
  versionId: string | null;
  sourceHash: string;
}

interface GraphEdgeInput {
  edgeType: GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  matterId: string;
  documentId: string | null;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class GraphSyncService {
  private readonly logger = new Logger(GraphSyncService.name);

  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async syncMatter(
    ctx: GraphSyncContext,
    matterId: string,
  ): Promise<GraphSyncResponseDto> {
    const startedAt = performance.now();
    try {
      return await this.auditService.transaction(ctx.tenantId, async (client) => {
        const syncRunId = await this.createRun(client, ctx.tenantId, matterId);
        const matter = await this.findMatter(client, ctx.tenantId, matterId);
        if (!matter) {
          throw new BadRequestException({ code: 'VALIDATION_FAILED' });
        }

        await this.markMatterGraphStale(client, ctx.tenantId, matterId);
        const clientNodeId = await this.upsertNode(client, ctx.tenantId, {
          nodeType: 'client',
          sourceTable: 'clients',
          sourceId: matter.client_id,
          matterId: null,
          documentId: null,
          versionId: null,
          sourceHash: sha256Hex(`client:${matter.client_id}`),
        });
        const matterNodeId = await this.upsertNode(client, ctx.tenantId, {
          nodeType: 'matter',
          sourceTable: 'matters',
          sourceId: matter.matter_id,
          matterId,
          documentId: null,
          versionId: null,
          sourceHash: sha256Hex(`matter:${matter.matter_id}`),
        });
        await this.upsertEdge(client, ctx.tenantId, {
          edgeType: 'HAS_MATTER',
          sourceNodeId: clientNodeId,
          targetNodeId: matterNodeId,
          matterId,
          documentId: null,
        });

        const documents = await this.listCurrentDocuments(client, ctx.tenantId, matterId);
        for (const document of documents) {
          const documentNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'document',
            sourceTable: 'documents',
            sourceId: document.document_id,
            matterId,
            documentId: document.document_id,
            versionId: null,
            sourceHash: sha256Hex(`document:${document.document_id}`),
          });
          const versionNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'version',
            sourceTable: 'document_versions',
            sourceId: document.version_id,
            matterId,
            documentId: document.document_id,
            versionId: document.version_id,
            sourceHash: sha256Hex(`version:${document.version_id}`),
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_DOCUMENT',
            sourceNodeId: matterNodeId,
            targetNodeId: documentNodeId,
            matterId,
            documentId: document.document_id,
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_VERSION',
            sourceNodeId: documentNodeId,
            targetNodeId: versionNodeId,
            matterId,
            documentId: document.document_id,
          });
        }

        const clauses = await this.listClauseChunks(client, ctx.tenantId, matterId);
        for (const clause of clauses) {
          const versionNodeId = await this.findNodeId(
            client,
            ctx.tenantId,
            'version',
            clause.version_id,
          );
          if (!versionNodeId) continue;
          const clauseNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'clause',
            sourceTable: 'document_chunks',
            sourceId: clause.chunk_id,
            matterId,
            documentId: clause.document_id,
            versionId: clause.version_id,
            sourceHash: sha256Hex(`clause:${clause.chunk_id}:${clause.source_text_hash}`),
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_CLAUSE',
            sourceNodeId: versionNodeId,
            targetNodeId: clauseNodeId,
            matterId,
            documentId: clause.document_id,
          });
        }

        const counts = await this.countActiveAndStale(client, ctx.tenantId, matterId);
        await client.query(
          `
            UPDATE graph_sync_runs
            SET status = 'success',
              node_count = $3,
              edge_count = $4,
              stale_node_count = $5,
              stale_edge_count = $6,
              completed_at = now()
            WHERE tenant_id = $1
              AND sync_run_id = $2
          `,
          [
            ctx.tenantId,
            syncRunId,
            counts.nodeCount,
            counts.edgeCount,
            counts.staleNodeCount,
            counts.staleEdgeCount,
          ],
        );
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'GRAPH_SYNCED',
            targetType: 'graph_sync',
            targetId: syncRunId,
            matterId,
            metadata: {
              sync_run_id: syncRunId,
              matter_id: matterId,
              node_count: counts.nodeCount,
              edge_count: counts.edgeCount,
              stale_count: counts.staleNodeCount + counts.staleEdgeCount,
              duration_ms: Math.round(performance.now() - startedAt),
            },
          },
          client,
        );

        return {
          syncRunId,
          matterId,
          status: 'success',
          nodeCount: counts.nodeCount,
          edgeCount: counts.edgeCount,
          staleNodeCount: counts.staleNodeCount,
          staleEdgeCount: counts.staleEdgeCount,
        };
      });
    } catch (error) {
      this.logger.warn({ code: 'GRAPH_SYNC_FAILED', matterId });
      throw error;
    }
  }

  private async createRun(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<string> {
    const result = await client.query<{ sync_run_id: string }>(
      `
        INSERT INTO graph_sync_runs (tenant_id, matter_id, scope_id)
        VALUES ($1, $2, $2)
        RETURNING sync_run_id
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('graph sync run insert returned no row');
    return row.sync_run_id;
  }

  private async findMatter(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterSourceRow | null> {
    const result = await client.query<MatterSourceRow>(
      `
        SELECT matter_id, client_id
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return result.rows[0] ?? null;
  }

  private async markMatterGraphStale(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE graph_edges
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
      `,
      [tenantId, matterId],
    );
    await client.query(
      `
        UPDATE graph_nodes
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
      `,
      [tenantId, matterId],
    );
  }

  private async listCurrentDocuments(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DocumentSourceRow[]> {
    const result = await client.query<DocumentSourceRow>(
      `
        SELECT d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        ORDER BY d.document_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listClauseChunks(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<ClauseSourceRow[]> {
    const result = await client.query<ClauseSourceRow>(
      `
        SELECT dc.chunk_id, dc.document_id, dc.version_id, dc.source_text_hash
        FROM document_chunks dc
        JOIN documents d
          ON d.tenant_id = dc.tenant_id
          AND d.document_id = dc.document_id
        JOIN document_versions dv
          ON dv.tenant_id = dc.tenant_id
          AND dv.version_id = dc.version_id
          AND dv.version_status = 'current'
        WHERE dc.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
          AND dc.chunk_kind = 'parent'
          AND dc.stale = false
        ORDER BY dc.document_id, dc.chunk_ordinal
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async upsertNode(
    client: PoolClient,
    tenantId: string,
    input: GraphNodeInput,
  ): Promise<string> {
    const result = await client.query<{ node_id: string }>(
      `
        INSERT INTO graph_nodes (
          tenant_id, node_type, source_table, source_id, matter_id, document_id,
          version_id, source_hash, stale, synced_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, now(), now())
        ON CONFLICT (tenant_id, node_type, source_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          version_id = EXCLUDED.version_id,
          source_hash = EXCLUDED.source_hash,
          stale = false,
          synced_at = EXCLUDED.synced_at,
          updated_at = EXCLUDED.updated_at
        RETURNING node_id
      `,
      [
        tenantId,
        input.nodeType,
        input.sourceTable,
        input.sourceId,
        input.matterId,
        input.documentId,
        input.versionId,
        input.sourceHash,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('graph node upsert returned no row');
    return row.node_id;
  }

  private async findNodeId(
    client: PoolClient,
    tenantId: string,
    nodeType: GraphNodeType,
    sourceId: string,
  ): Promise<string | null> {
    const result = await client.query<{ node_id: string }>(
      `
        SELECT node_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND node_type = $2
          AND source_id = $3
          AND stale = false
        LIMIT 1
      `,
      [tenantId, nodeType, sourceId],
    );
    return result.rows[0]?.node_id ?? null;
  }

  private async upsertEdge(
    client: PoolClient,
    tenantId: string,
    input: GraphEdgeInput,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO graph_edges (
          tenant_id, edge_type, source_node_id, target_node_id, matter_id,
          document_id, source_hash, stale, synced_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, now(), now())
        ON CONFLICT (tenant_id, edge_type, source_node_id, target_node_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          source_hash = EXCLUDED.source_hash,
          stale = false,
          synced_at = EXCLUDED.synced_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        tenantId,
        input.edgeType,
        input.sourceNodeId,
        input.targetNodeId,
        input.matterId,
        input.documentId,
        sha256Hex(`${input.edgeType}:${input.sourceNodeId}:${input.targetNodeId}`),
      ],
    );
  }

  private async countActiveAndStale(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<{
    nodeCount: number;
    edgeCount: number;
    staleNodeCount: number;
    staleEdgeCount: number;
  }> {
    const result = await client.query<{
      active_nodes: string;
      active_edges: string;
      stale_nodes: string;
      stale_edges: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM graph_nodes WHERE tenant_id = $1 AND matter_id = $2 AND stale = false)::text AS active_nodes,
          (SELECT count(*) FROM graph_edges WHERE tenant_id = $1 AND matter_id = $2 AND stale = false)::text AS active_edges,
          (SELECT count(*) FROM graph_nodes WHERE tenant_id = $1 AND matter_id = $2 AND stale = true)::text AS stale_nodes,
          (SELECT count(*) FROM graph_edges WHERE tenant_id = $1 AND matter_id = $2 AND stale = true)::text AS stale_edges
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    return {
      nodeCount: Number(row?.active_nodes ?? 0),
      edgeCount: Number(row?.active_edges ?? 0),
      staleNodeCount: Number(row?.stale_nodes ?? 0),
      staleEdgeCount: Number(row?.stale_edges ?? 0),
    };
  }
}
