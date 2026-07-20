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
  term_key: string | null;
  source_version_id: string | null;
  target_version_id: string | null;
  fact_id: string | null;
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
          all_versions AS (
            SELECT d.tenant_id, d.matter_id, d.document_id, dv.version_id,
              dv.version_no, dv.version_status, dv.supersedes_version_id
            FROM documents d
            JOIN document_versions dv
              ON dv.tenant_id = d.tenant_id
              AND dv.document_id = d.document_id
            WHERE d.tenant_id = $1
              AND d.matter_id = $2
              AND d.status <> 'deleted'
              AND d.deleted_at IS NULL
          ),
          missing_document_nodes AS (
            SELECT 'missing_document_node'::text AS kind, ad.matter_id, ad.document_id,
              NULL::uuid AS version_id, NULL::uuid AS node_id, NULL::uuid AS edge_id,
              NULL::text AS term_key, NULL::uuid AS source_version_id,
              NULL::uuid AS target_version_id, NULL::uuid AS fact_id
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
              ad.version_id, NULL::uuid AS node_id, NULL::uuid AS edge_id,
              NULL::text AS term_key, NULL::uuid AS source_version_id,
              NULL::uuid AS target_version_id, NULL::uuid AS fact_id
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
              NULL::uuid AS version_id, gn.node_id, NULL::uuid AS edge_id,
              NULL::text AS term_key, NULL::uuid AS source_version_id,
              NULL::uuid AS target_version_id, NULL::uuid AS fact_id
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
              NULL::uuid AS version_id, NULL::uuid AS node_id, ge.edge_id,
              NULL::text AS term_key, NULL::uuid AS source_version_id,
              NULL::uuid AS target_version_id, NULL::uuid AS fact_id
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
          ),
          version_lineage_conflicts AS (
            SELECT 'version_lineage_conflict'::text AS kind, av.matter_id, av.document_id,
              av.version_id, NULL::uuid AS node_id, NULL::uuid AS edge_id,
              NULL::text AS term_key, av.version_id AS source_version_id,
              av.supersedes_version_id AS target_version_id, NULL::uuid AS fact_id
            FROM all_versions av
            WHERE av.version_no > 1
              AND av.supersedes_version_id IS NULL
          ),
          defined_term_mismatch_groups AS (
            SELECT cdt.matter_id, cdt.normalized_term_key,
              array_agg(DISTINCT cdt.version_id ORDER BY cdt.version_id) AS version_ids
            FROM contract_defined_terms cdt
            WHERE cdt.tenant_id = $1
              AND cdt.matter_id = $2
              AND cdt.stale = false
            GROUP BY cdt.matter_id, cdt.normalized_term_key
            HAVING count(DISTINCT cdt.definition_hash) > 1
              AND count(DISTINCT cdt.document_id) > 1
          ),
          defined_term_mismatches AS (
            SELECT 'defined_term_mismatch'::text AS kind, dtm.matter_id,
              NULL::uuid AS document_id, NULL::uuid AS version_id,
              NULL::uuid AS node_id, NULL::uuid AS edge_id,
              dtm.normalized_term_key AS term_key,
              dtm.version_ids[1] AS source_version_id,
              dtm.version_ids[2] AS target_version_id,
              NULL::uuid AS fact_id
            FROM defined_term_mismatch_groups dtm
          ),
          verified_fact_evidence_gaps AS (
            SELECT 'evidence_gap'::text AS kind, lf.matter_id, le.document_id,
              le.version_id, gn.node_id, NULL::uuid AS edge_id,
              NULL::text AS term_key, NULL::uuid AS source_version_id,
              NULL::uuid AS target_version_id, lf.fact_id
            FROM litigation_facts lf
            LEFT JOIN litigation_evidence_items le
              ON le.tenant_id = lf.tenant_id
              AND le.evidence_id = lf.evidence_id
            LEFT JOIN graph_nodes gn
              ON gn.tenant_id = lf.tenant_id
              AND gn.node_type = 'fact'
              AND gn.source_id = lf.fact_id
              AND gn.stale = false
            WHERE lf.tenant_id = $1
              AND lf.matter_id = $2
              AND lf.status = 'verified'
              AND (
                cardinality(lf.citation_refs) = 0
                OR NOT EXISTS (
                  SELECT 1
                  FROM graph_edges ge
                  WHERE ge.tenant_id = lf.tenant_id
                    AND ge.edge_type = 'EVIDENCED_BY'
                    AND ge.source_node_id = gn.node_id
                    AND ge.stale = false
                )
              )
          )
          SELECT * FROM missing_document_nodes
          UNION ALL SELECT * FROM missing_version_nodes
          UNION ALL SELECT * FROM stale_document_nodes
          UNION ALL SELECT * FROM stale_edges
          UNION ALL SELECT * FROM version_lineage_conflicts
          UNION ALL SELECT * FROM defined_term_mismatches
          UNION ALL SELECT * FROM verified_fact_evidence_gaps
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
    termKey: row.term_key,
    sourceVersionId: row.source_version_id,
    targetVersionId: row.target_version_id,
    factId: row.fact_id,
  };
}
