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
    SELECT 'FACT_CONFIRMED'
    UNION
    SELECT 'FACT_REJECTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DO $$
DECLARE
  source_values text[];
  source_list text;
BEGIN
  SELECT array_agg(source_name ORDER BY source_name)
  INTO source_values
  FROM (
    SELECT DISTINCT match[1] AS source_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'graph_nodes'::regclass
      AND c.conname = 'graph_nodes_source_table_check'
    UNION
    SELECT 'ai_claims'
  ) sources;

  SELECT string_agg(quote_literal(source_name), ', ')
  INTO source_list
  FROM unnest(source_values) AS values(source_name);

  EXECUTE 'ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check';
  EXECUTE 'ALTER TABLE graph_nodes ADD CONSTRAINT graph_nodes_source_table_check CHECK (source_table = ANY (ARRAY[' || source_list || ']::text[]))';
END $$;

ALTER TABLE work_items
  DROP CONSTRAINT IF EXISTS work_items_kind_check,
  DROP CONSTRAINT IF EXISTS work_items_target_type_check;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_kind_check CHECK (
    kind IN (
      'records_disposal_approval',
      'records_disposal_execution',
      'document_extraction_failed',
      'document_ocr_pending',
      'document_metadata_required',
      'duplicate_decision_pending',
      'upload_exception',
      'contract_review_stage',
      'dd_rfi_due',
      'dd_mapping_review',
      'external_qa_approval',
      'litigation_deadline',
      'ai_candidate_review',
      'graph_fact_review'
    )
  ),
  ADD CONSTRAINT work_items_target_type_check CHECK (
    target_type IN (
      'disposal_request',
      'document',
      'document_version',
      'upload_preflight',
      'contract_review',
      'dd_rfi',
      'dd_mapping',
      'external_qa',
      'litigation_key_date',
      'ai_prep_artifact',
      'graph_node'
    )
  );

COMMENT ON CONSTRAINT graph_nodes_source_table_check ON graph_nodes IS
  'F9 allows ai_claims to project as ai_proposed fact graph nodes without storing claim body in graph_nodes.';
COMMENT ON COLUMN work_items.kind IS
  'DMS work kind. graph_fact_review rows point at graph_nodes sourced from ai_claims and are completed by the graph review API.';

-- Down Migration

DELETE FROM work_items
WHERE kind = 'graph_fact_review'
  OR target_type = 'graph_node';

DELETE FROM graph_edges ge
USING graph_nodes source_node, graph_nodes target_node
WHERE ge.tenant_id = source_node.tenant_id
  AND ge.source_node_id = source_node.node_id
  AND ge.tenant_id = target_node.tenant_id
  AND ge.target_node_id = target_node.node_id
  AND (
    source_node.source_table = 'ai_claims'
    OR target_node.source_table = 'ai_claims'
  );

DELETE FROM graph_nodes
WHERE source_table = 'ai_claims';

DO $$
DECLARE
  source_values text[];
  source_list text;
BEGIN
  SELECT array_agg(source_name ORDER BY source_name)
  INTO source_values
  FROM (
    SELECT DISTINCT match[1] AS source_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'graph_nodes'::regclass
      AND c.conname = 'graph_nodes_source_table_check'
      AND match[1] <> 'ai_claims'
  ) sources;

  SELECT string_agg(quote_literal(source_name), ', ')
  INTO source_list
  FROM unnest(source_values) AS values(source_name);

  EXECUTE 'ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check';
  EXECUTE 'ALTER TABLE graph_nodes ADD CONSTRAINT graph_nodes_source_table_check CHECK (source_table = ANY (ARRAY[' || source_list || ']::text[]))';
END $$;

ALTER TABLE work_items
  DROP CONSTRAINT IF EXISTS work_items_kind_check,
  DROP CONSTRAINT IF EXISTS work_items_target_type_check;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_kind_check CHECK (
    kind IN (
      'records_disposal_approval',
      'records_disposal_execution',
      'document_extraction_failed',
      'document_ocr_pending',
      'document_metadata_required',
      'duplicate_decision_pending',
      'upload_exception',
      'contract_review_stage',
      'dd_rfi_due',
      'dd_mapping_review',
      'external_qa_approval',
      'litigation_deadline',
      'ai_candidate_review'
    )
  ),
  ADD CONSTRAINT work_items_target_type_check CHECK (
    target_type IN (
      'disposal_request',
      'document',
      'document_version',
      'upload_preflight',
      'contract_review',
      'dd_rfi',
      'dd_mapping',
      'external_qa',
      'litigation_key_date',
      'ai_prep_artifact'
    )
  );

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
      AND (
        match[1] NOT IN ('FACT_CONFIRMED', 'FACT_REJECTED')
        OR EXISTS (
          SELECT 1
          FROM audit_events ae
          WHERE ae.action = match[1]
          LIMIT 1
        )
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
