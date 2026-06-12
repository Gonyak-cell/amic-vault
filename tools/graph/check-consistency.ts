#!/usr/bin/env node
import { Client } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const tenantId = argValue(args, '--tenant-id');
const matterId = argValue(args, '--matter-id');
if (!tenantId || !matterId) {
  console.error('usage: pnpm graph:check -- --tenant-id <tenant_uuid> --matter-id <matter_uuid>');
  process.exit(2);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant_id', tenantId]);
  const result = await client.query(
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
    [tenantId, matterId],
  );
  const drifts = result.rows.map((row) => ({
    kind: row.kind,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    nodeId: row.node_id,
    edgeId: row.edge_id,
  }));
  console.log(
    JSON.stringify(
      {
        tenantId,
        matterId,
        status: drifts.length === 0 ? 'consistent' : 'drift_detected',
        driftCount: drifts.length,
        drifts,
      },
      null,
      2,
    ),
  );
  if (drifts.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
