-- Up Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
    UNION
    SELECT 'NEGOTIATION_POSITION_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

ALTER TABLE playbook_rules
  ADD COLUMN client_id uuid,
  ADD CONSTRAINT fk_playbook_rules_client
    FOREIGN KEY (tenant_id, client_id)
    REFERENCES clients (tenant_id, client_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT playbook_rules_single_scope_check
    CHECK (num_nonnulls(matter_id, client_id) <= 1);

CREATE INDEX idx_playbook_rules_tenant_client_status
  ON playbook_rules (tenant_id, client_id, status, rule_key, version_number DESC)
  WHERE client_id IS NOT NULL;

GRANT UPDATE (client_id) ON playbook_rules TO vault_app;

CREATE TABLE negotiation_positions (
  position_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  party_id uuid NOT NULL,
  issue_label text NOT NULL CHECK (char_length(issue_label) BETWEEN 1 AND 120),
  clause_kind text NOT NULL CHECK (
    clause_kind IN (
      'indemnity',
      'liability_cap',
      'confidentiality',
      'termination',
      'governing_law',
      'payment',
      'non_compete',
      'assignment',
      'dispute_resolution',
      'other'
    )
  ),
  position_summary text NOT NULL CHECK (char_length(position_summary) BETWEEN 1 AND 2000),
  position_summary_hash char(64) NOT NULL CHECK (position_summary_hash ~ '^[0-9a-f]{64}$'),
  source_document_id uuid NOT NULL,
  source_version_id uuid NOT NULL,
  source_clause_id uuid,
  round_no integer NOT NULL CHECK (round_no BETWEEN 1 AND 100),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, position_id),
  CONSTRAINT fk_negotiation_positions_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_negotiation_positions_party
    FOREIGN KEY (tenant_id, party_id)
    REFERENCES parties (tenant_id, party_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_negotiation_positions_document
    FOREIGN KEY (tenant_id, source_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_negotiation_positions_version
    FOREIGN KEY (tenant_id, source_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_negotiation_positions_clause
    FOREIGN KEY (tenant_id, source_clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_negotiation_positions_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_negotiation_positions_party_kind
  ON negotiation_positions (tenant_id, party_id, clause_kind, updated_at DESC);

CREATE INDEX idx_negotiation_positions_matter_round
  ON negotiation_positions (tenant_id, matter_id, round_no DESC, updated_at DESC);

ALTER TABLE negotiation_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_positions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_negotiation_positions_tenant ON negotiation_positions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON negotiation_positions TO vault_app;
GRANT UPDATE (
  issue_label,
  clause_kind,
  position_summary,
  position_summary_hash,
  source_document_id,
  source_version_id,
  source_clause_id,
  round_no,
  updated_at
) ON negotiation_positions TO vault_app;

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_node_type_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_scope_shape_check;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN (
      'client',
      'matter',
      'document',
      'version',
      'text_chunk',
      'clause',
      'defined_term',
      'fact',
      'evidence',
      'issue',
      'risk',
      'rfi',
      'party',
      'negotiation_position'
    )
  ),
  ADD CONSTRAINT graph_nodes_source_table_check CHECK (
    source_table IN (
      'clients',
      'matters',
      'documents',
      'document_versions',
      'document_chunks',
      'contract_clauses',
      'contract_defined_terms',
      'litigation_facts',
      'litigation_evidence_items',
      'litigation_issue_nodes',
      'dd_issues',
      'dd_risks',
      'dd_rfis',
      'parties',
      'ai_claims',
      'negotiation_positions'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type IN ('version', 'text_chunk', 'clause', 'defined_term') AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party', 'negotiation_position') AND matter_id IS NOT NULL)
  );

ALTER TABLE graph_edges
  DROP CONSTRAINT IF EXISTS graph_edges_edge_type_check,
  DROP CONSTRAINT IF EXISTS graph_edges_document_scope_check;

ALTER TABLE graph_edges
  ADD CONSTRAINT graph_edges_edge_type_check CHECK (
    edge_type IN (
      'HAS_MATTER',
      'HAS_DOCUMENT',
      'HAS_VERSION',
      'HAS_CLAUSE',
      'HAS_FACT',
      'EVIDENCED_BY',
      'REQUIRES_ACTION',
      'HAS_PARTY',
      'HAS_POSITION',
      'HAS_ISSUE',
      'HAS_RISK',
      'HAS_SUB_ISSUE',
      'SUPERSEDES',
      'AMENDS',
      'CITES',
      'DEFINES',
      'CONTAINS_CLAUSE',
      'ALIGNED_WITH',
      'RELATED_TO'
    )
  ),
  ADD CONSTRAINT graph_edges_document_scope_check CHECK (
    (edge_type = 'HAS_MATTER' AND document_id IS NULL)
    OR (edge_type IN ('HAS_DOCUMENT', 'HAS_VERSION', 'HAS_CLAUSE') AND document_id IS NOT NULL)
    OR edge_type IN (
      'HAS_FACT',
      'EVIDENCED_BY',
      'REQUIRES_ACTION',
      'HAS_PARTY',
      'HAS_POSITION',
      'HAS_ISSUE',
      'HAS_RISK',
      'HAS_SUB_ISSUE',
      'SUPERSEDES',
      'AMENDS',
      'CITES',
      'DEFINES',
      'CONTAINS_CLAUSE',
      'ALIGNED_WITH',
      'RELATED_TO'
    )
  );

COMMENT ON COLUMN playbook_rules.client_id IS
  'F13 optional client-scope playbook rule owner. Mutually exclusive with matter_id; NULL/NULL remains firm-wide.';
COMMENT ON TABLE negotiation_positions IS
  'F13 deterministic negotiation position log. Stores bounded summaries and hashes for counterparty pattern aggregation; audit metadata must use IDs and hashes only.';
COMMENT ON COLUMN negotiation_positions.clause_kind IS
  'F13 semantic clause kind enum for deterministic counterparty pattern aggregation; distinct from structural contract_clauses.clause_kind.';

-- Down Migration

DELETE FROM graph_edges ge
USING graph_nodes source_node, graph_nodes target_node
WHERE ge.tenant_id = source_node.tenant_id
  AND ge.source_node_id = source_node.node_id
  AND ge.tenant_id = target_node.tenant_id
  AND ge.target_node_id = target_node.node_id
  AND (
    source_node.source_table = 'negotiation_positions'
    OR target_node.source_table = 'negotiation_positions'
    OR ge.edge_type = 'HAS_POSITION'
  );

DELETE FROM graph_nodes
WHERE source_table = 'negotiation_positions'
  OR node_type = 'negotiation_position';

DROP TABLE IF EXISTS negotiation_positions;

DELETE FROM playbook_rules
WHERE client_id IS NOT NULL;

DROP INDEX IF EXISTS idx_playbook_rules_tenant_client_status;

ALTER TABLE playbook_rules
  DROP CONSTRAINT IF EXISTS playbook_rules_single_scope_check,
  DROP CONSTRAINT IF EXISTS fk_playbook_rules_client,
  DROP COLUMN IF EXISTS client_id;

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_node_type_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_scope_shape_check;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN (
      'client',
      'matter',
      'document',
      'version',
      'text_chunk',
      'clause',
      'defined_term',
      'fact',
      'evidence',
      'issue',
      'risk',
      'rfi',
      'party'
    )
  ),
  ADD CONSTRAINT graph_nodes_source_table_check CHECK (
    source_table IN (
      'clients',
      'matters',
      'documents',
      'document_versions',
      'document_chunks',
      'contract_clauses',
      'contract_defined_terms',
      'litigation_facts',
      'litigation_evidence_items',
      'litigation_issue_nodes',
      'dd_issues',
      'dd_risks',
      'dd_rfis',
      'parties',
      'ai_claims'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type IN ('version', 'text_chunk', 'clause', 'defined_term') AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party') AND matter_id IS NOT NULL)
  );

ALTER TABLE graph_edges
  DROP CONSTRAINT IF EXISTS graph_edges_edge_type_check,
  DROP CONSTRAINT IF EXISTS graph_edges_document_scope_check;

ALTER TABLE graph_edges
  ADD CONSTRAINT graph_edges_edge_type_check CHECK (
    edge_type IN (
      'HAS_MATTER',
      'HAS_DOCUMENT',
      'HAS_VERSION',
      'HAS_CLAUSE',
      'HAS_FACT',
      'EVIDENCED_BY',
      'REQUIRES_ACTION',
      'HAS_PARTY',
      'HAS_ISSUE',
      'HAS_RISK',
      'HAS_SUB_ISSUE',
      'SUPERSEDES',
      'AMENDS',
      'CITES',
      'DEFINES',
      'CONTAINS_CLAUSE',
      'ALIGNED_WITH',
      'RELATED_TO'
    )
  ),
  ADD CONSTRAINT graph_edges_document_scope_check CHECK (
    (edge_type = 'HAS_MATTER' AND document_id IS NULL)
    OR (edge_type IN ('HAS_DOCUMENT', 'HAS_VERSION', 'HAS_CLAUSE') AND document_id IS NOT NULL)
    OR edge_type IN (
      'HAS_FACT',
      'EVIDENCED_BY',
      'REQUIRES_ACTION',
      'HAS_PARTY',
      'HAS_ISSUE',
      'HAS_RISK',
      'HAS_SUB_ISSUE',
      'SUPERSEDES',
      'AMENDS',
      'CITES',
      'DEFINES',
      'CONTAINS_CLAUSE',
      'ALIGNED_WITH',
      'RELATED_TO'
    )
  );

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (SELECT 1 FROM audit_events WHERE action = 'NEGOTIATION_POSITION_CHANGED' LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> 'NEGOTIATION_POSITION_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
