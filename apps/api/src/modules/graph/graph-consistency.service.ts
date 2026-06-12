import { Inject, Injectable } from '@nestjs/common';
import type {
  GraphConsistencyDriftDto,
  GraphConsistencyResponseDto,
  PermissionContext,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';

interface DriftRow {
  kind: GraphConsistencyDriftDto['kind'];
  matter_id: string;
  document_id: string | null;
  version_id: string | null;
  node_id: string | null;
  edge_id: string | null;
}

@Injectable()
export class GraphConsistencyService {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async checkMatter(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<GraphConsistencyResponseDto> {
    const startedAt = performance.now();
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DriftRow>(
        `
          WITH active_documents AS (
            SELECT d.tenant_id, d.matter_id, d.document_id, dv.version_id
            FROM documents d
            JOIN document_versions dv
              ON dv.tenant_id = d.tenant_id
              AND dv.document_id = d.document_id
              AND dv.version_status = 'current'
            WHERE d.tenant_id = $1
              AND d.matter_id = $2
              AND d.status <> 'deleted'
              AND d.deleted_at IS NULL
          ),
          missing_document_nodes AS (
            SELECT 'missing_document_node'::text AS kind, ad.matter_id, ad.document_id,
              NULL::uuid AS version_id, NULL::uuid AS node_id, NULL::uuid AS edge_id
            FROM active_documents ad
            WHERE NOT EXISTS (
              SELECT 1
              FROM graph_nodes gn
              WHERE gn.tenant_id = ad.tenant_id
                AND gn.node_type = 'document'
                AND gn.source_id = ad.document_id
                AND gn.stale = false
            )
          ),
          missing_version_nodes AS (
            SELECT 'missing_version_node'::text AS kind, ad.matter_id, ad.document_id,
              ad.version_id, NULL::uuid AS node_id, NULL::uuid AS edge_id
            FROM active_documents ad
            WHERE NOT EXISTS (
              SELECT 1
              FROM graph_nodes gn
              WHERE gn.tenant_id = ad.tenant_id
                AND gn.node_type = 'version'
                AND gn.source_id = ad.version_id
                AND gn.stale = false
            )
          ),
          stale_document_nodes AS (
            SELECT 'stale_document_node'::text AS kind, gn.matter_id, gn.document_id,
              NULL::uuid AS version_id, gn.node_id, NULL::uuid AS edge_id
            FROM graph_nodes gn
            LEFT JOIN documents d
              ON d.tenant_id = gn.tenant_id
              AND d.document_id = gn.document_id
            WHERE gn.tenant_id = $1
              AND gn.matter_id = $2
              AND gn.node_type = 'document'
              AND gn.stale = false
              AND (
                d.document_id IS NULL
                OR d.status = 'deleted'
                OR d.deleted_at IS NOT NULL
              )
          ),
          stale_edges AS (
            SELECT 'edge_points_to_stale_node'::text AS kind, ge.matter_id, ge.document_id,
              NULL::uuid AS version_id, NULL::uuid AS node_id, ge.edge_id
            FROM graph_edges ge
            JOIN graph_nodes source_node
              ON source_node.tenant_id = ge.tenant_id
              AND source_node.node_id = ge.source_node_id
            JOIN graph_nodes target_node
              ON target_node.tenant_id = ge.tenant_id
              AND target_node.node_id = ge.target_node_id
            WHERE ge.tenant_id = $1
              AND ge.matter_id = $2
              AND ge.stale = false
              AND (source_node.stale = true OR target_node.stale = true)
          )
          SELECT * FROM missing_document_nodes
          UNION ALL SELECT * FROM missing_version_nodes
          UNION ALL SELECT * FROM stale_document_nodes
          UNION ALL SELECT * FROM stale_edges
          LIMIT 200
        `,
        [ctx.tenantId, matterId],
      );
      const drifts = result.rows.map(toDrift);
      const status = drifts.length === 0 ? 'consistent' : 'drift_detected';
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'GRAPH_CONSISTENCY_CHECKED',
          targetType: 'graph_consistency',
          targetId: matterId,
          matterId,
          result: status === 'consistent' ? 'success' : 'failure',
          metadata: {
            matter_id: matterId,
            consistency_status: status,
            drift_count: drifts.length,
            duration_ms: Math.round(performance.now() - startedAt),
          },
        },
        client,
      );
      return {
        matterId,
        status,
        driftCount: drifts.length,
        drifts,
      };
    });
  }
}

function toDrift(row: DriftRow): GraphConsistencyDriftDto {
  return {
    kind: row.kind,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    nodeId: row.node_id,
    edgeId: row.edge_id,
  };
}
