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
    SELECT 'WORK_ITEM_REASSIGNED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
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
      'litigation_deadline'
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
      'litigation_key_date'
    )
  );

CREATE INDEX idx_work_items_tenant_kind_assignee_due
  ON work_items (tenant_id, kind, assignment_scope, assigned_to_user_id, status, due_at ASC, updated_at DESC);

COMMENT ON COLUMN work_items.kind IS
  'DMS work kind. Workflow kinds are opened by owning workflow modules and displayed through the shared work queue only after permission-scoped filtering.';

-- Down Migration

DELETE FROM work_items
WHERE kind IN (
    'contract_review_stage',
    'dd_rfi_due',
    'dd_mapping_review',
    'external_qa_approval',
    'litigation_deadline'
  )
  OR target_type IN (
    'contract_review',
    'dd_rfi',
    'dd_mapping',
    'external_qa',
    'litigation_key_date'
  );

DROP INDEX IF EXISTS idx_work_items_tenant_kind_assignee_due;

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
      'upload_exception'
    )
  ),
  ADD CONSTRAINT work_items_target_type_check CHECK (
    target_type IN ('disposal_request', 'document', 'document_version', 'upload_preflight')
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
        match[1] <> 'WORK_ITEM_REASSIGNED'
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
