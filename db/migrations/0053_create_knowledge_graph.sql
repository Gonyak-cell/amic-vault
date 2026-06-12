-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE graph_sync_runs (
  sync_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  scope_type text NOT NULL DEFAULT 'matter' CHECK (scope_type = 'matter'),
  scope_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failure')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  edge_count integer NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  stale_node_count integer NOT NULL DEFAULT 0 CHECK (stale_node_count >= 0),
  stale_edge_count integer NOT NULL DEFAULT 0 CHECK (stale_edge_count >= 0),
  error_ref text CHECK (error_ref IS NULL OR char_length(error_ref) BETWEEN 1 AND 200),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, sync_run_id),
  CONSTRAINT fk_graph_sync_runs_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CHECK (scope_id = matter_id)
);

CREATE INDEX idx_graph_sync_runs_tenant_matter_started
  ON graph_sync_runs (tenant_id, matter_id, started_at DESC);

ALTER TABLE graph_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_sync_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_graph_sync_runs_tenant ON graph_sync_runs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON graph_sync_runs TO vault_app;
GRANT UPDATE (
  status,
  attempt_count,
  node_count,
  edge_count,
  stale_node_count,
  stale_edge_count,
  error_ref,
  completed_at
) ON graph_sync_runs TO vault_app;

CREATE TABLE graph_nodes (
  node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  node_type text NOT NULL CHECK (
    node_type IN ('client', 'matter', 'document', 'version', 'clause', 'issue', 'risk')
  ),
  source_table text NOT NULL CHECK (
    source_table IN (
      'clients',
      'matters',
      'documents',
      'document_versions',
      'document_chunks',
      'reserved_issue',
      'reserved_risk'
    )
  ),
  source_id uuid NOT NULL,
  matter_id uuid,
  document_id uuid,
  version_id uuid,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, node_id),
  UNIQUE (tenant_id, node_type, source_id),
  CONSTRAINT fk_graph_nodes_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_nodes_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_nodes_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type = 'version' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('clause', 'issue', 'risk') AND matter_id IS NOT NULL)
  )
);

CREATE INDEX idx_graph_nodes_tenant_matter_type
  ON graph_nodes (tenant_id, matter_id, node_type, stale);

CREATE INDEX idx_graph_nodes_tenant_document
  ON graph_nodes (tenant_id, document_id, node_type, stale)
  WHERE document_id IS NOT NULL;

ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_nodes FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_graph_nodes_tenant ON graph_nodes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON graph_nodes TO vault_app;
GRANT UPDATE (
  matter_id,
  document_id,
  version_id,
  source_hash,
  stale,
  synced_at,
  updated_at
) ON graph_nodes TO vault_app;

CREATE TABLE graph_edges (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  edge_type text NOT NULL CHECK (
    edge_type IN (
      'HAS_MATTER',
      'HAS_DOCUMENT',
      'HAS_VERSION',
      'HAS_CLAUSE',
      'HAS_ISSUE',
      'HAS_RISK',
      'RELATED_TO'
    )
  ),
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, edge_id),
  UNIQUE (tenant_id, edge_type, source_node_id, target_node_id),
  CONSTRAINT fk_graph_edges_source_node
    FOREIGN KEY (tenant_id, source_node_id)
    REFERENCES graph_nodes (tenant_id, node_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_edges_target_node
    FOREIGN KEY (tenant_id, target_node_id)
    REFERENCES graph_nodes (tenant_id, node_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_edges_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_edges_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CHECK (source_node_id <> target_node_id),
  CHECK (
    (edge_type = 'HAS_MATTER' AND document_id IS NULL)
    OR (edge_type <> 'HAS_MATTER' AND document_id IS NOT NULL)
  )
);

CREATE INDEX idx_graph_edges_tenant_matter
  ON graph_edges (tenant_id, matter_id, stale, edge_type);

CREATE INDEX idx_graph_edges_tenant_document
  ON graph_edges (tenant_id, document_id, stale, edge_type)
  WHERE document_id IS NOT NULL;

ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_graph_edges_tenant ON graph_edges
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON graph_edges TO vault_app;
GRANT UPDATE (
  matter_id,
  document_id,
  source_hash,
  stale,
  synced_at,
  updated_at
) ON graph_edges TO vault_app;

COMMENT ON TABLE graph_nodes IS
  'R7 derived knowledge graph nodes. Stores only source IDs, node type, source hash, and scope references; no document text, snippets, titles, or raw metadata.';

COMMENT ON TABLE graph_edges IS
  'R7 derived knowledge graph edges. Query APIs must inject matter, document, and ethical-wall permission scope before traversal.';

-- Down Migration

DROP TABLE IF EXISTS graph_edges;
DROP TABLE IF EXISTS graph_nodes;
DROP TABLE IF EXISTS graph_sync_runs;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After graph audit rows have been recorded,
-- rollback cannot safely remove GRAPH_* actions from the allow-list.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
