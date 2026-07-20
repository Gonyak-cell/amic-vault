-- Up Migration

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'graph_nodes'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%node_type%'
        OR pg_get_constraintdef(oid) LIKE '%source_table%'
      )
  LOOP
    EXECUTE format('ALTER TABLE graph_nodes DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;

  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'graph_edges'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%edge_type%'
  LOOP
    EXECUTE format('ALTER TABLE graph_edges DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN (
      'client',
      'matter',
      'document',
      'version',
      'clause',
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
      'litigation_facts',
      'litigation_evidence_items',
      'litigation_issue_nodes',
      'dd_issues',
      'dd_risks',
      'dd_rfis',
      'parties'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type = 'version' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type = 'clause' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party') AND matter_id IS NOT NULL)
  );

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

COMMENT ON CONSTRAINT graph_nodes_node_type_check ON graph_nodes IS
  'F1 graph taxonomy phase 1. Adds relation-table backed fact, evidence, rfi, and party nodes without adding external graph storage.';
COMMENT ON CONSTRAINT graph_nodes_source_table_check ON graph_nodes IS
  'F1 graph source table allow-list. New entries are existing tenant-scoped relation tables only.';
COMMENT ON CONSTRAINT graph_edges_edge_type_check ON graph_edges IS
  'F1 graph edge taxonomy phase 1. Allows existing relation-table projections and reserves no new node tables.';
COMMENT ON CONSTRAINT graph_edges_document_scope_check ON graph_edges IS
  'Document-scoped edges remain query-visible through permission-filtered document facts; matter-scoped relation edges may be stored without exposing document content.';

-- Down Migration

DELETE FROM graph_edges
WHERE edge_type IN (
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
  'ALIGNED_WITH'
);

DELETE FROM graph_nodes
WHERE node_type IN ('fact', 'evidence', 'rfi', 'party')
  OR source_table IN (
    'litigation_facts',
    'litigation_evidence_items',
    'litigation_issue_nodes',
    'dd_issues',
    'dd_risks',
    'dd_rfis',
    'parties'
  );

ALTER TABLE graph_edges
  DROP CONSTRAINT IF EXISTS graph_edges_document_scope_check,
  DROP CONSTRAINT IF EXISTS graph_edges_edge_type_check;

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_scope_shape_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_node_type_check;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN ('client', 'matter', 'document', 'version', 'clause', 'issue', 'risk')
  ),
  ADD CONSTRAINT graph_nodes_source_table_check CHECK (
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
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type = 'version' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('clause', 'issue', 'risk') AND matter_id IS NOT NULL)
  );

ALTER TABLE graph_edges
  ADD CONSTRAINT graph_edges_edge_type_check CHECK (
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
  ADD CONSTRAINT graph_edges_document_scope_check CHECK (
    (edge_type = 'HAS_MATTER' AND document_id IS NULL)
    OR (edge_type <> 'HAS_MATTER' AND document_id IS NOT NULL)
  );
