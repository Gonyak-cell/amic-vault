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
END $$;

UPDATE graph_nodes
SET node_type = 'text_chunk',
  updated_at = now()
WHERE node_type = 'clause'
  AND source_table = 'document_chunks';

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
      'parties'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (node_type IN ('version', 'text_chunk', 'clause', 'defined_term') AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NOT NULL)
    OR (node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party') AND matter_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT graph_nodes_node_type_check ON graph_nodes IS
  'F2 clause graph unification. document_chunks become text_chunk nodes; contract_clauses and contract_defined_terms become legal clause nodes.';
COMMENT ON CONSTRAINT graph_nodes_source_table_check ON graph_nodes IS
  'F2 graph source table allow-list adds contract_clauses and contract_defined_terms without storing clause body text in graph_nodes.';

-- Down Migration

DELETE FROM graph_edges ge
USING graph_nodes source_node, graph_nodes target_node
WHERE ge.tenant_id = source_node.tenant_id
  AND ge.source_node_id = source_node.node_id
  AND ge.tenant_id = target_node.tenant_id
  AND ge.target_node_id = target_node.node_id
  AND (
    ge.edge_type IN ('CONTAINS_CLAUSE', 'DEFINES', 'ALIGNED_WITH')
    OR source_node.source_table IN ('contract_clauses', 'contract_defined_terms')
    OR target_node.source_table IN ('contract_clauses', 'contract_defined_terms')
  );

DELETE FROM graph_nodes
WHERE source_table IN ('contract_clauses', 'contract_defined_terms');

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
END $$;

UPDATE graph_nodes
SET node_type = 'clause',
  updated_at = now()
WHERE node_type = 'text_chunk'
  AND source_table = 'document_chunks';

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
