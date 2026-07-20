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
    SELECT 'KNOWLEDGE_CANDIDATE_PROPOSED'
    UNION
    SELECT 'KNOWLEDGE_CANDIDATE_REVIEWED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE knowledge_candidates (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  candidate_type text NOT NULL CHECK (candidate_type IN ('executed', 'opinion', 'clause_source')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text CHECK (
    review_reason IS NULL
    OR (
      char_length(review_reason) BETWEEN 8 AND 500
      AND review_reason !~ '[[:cntrl:]]'
    )
  ),
  closing_binder_id uuid,
  work_item_id uuid,
  created_audit_event_id uuid,
  last_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, candidate_id),
  UNIQUE (tenant_id, matter_id, document_id, version_id, candidate_type),
  CONSTRAINT fk_knowledge_candidates_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_candidates_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_candidates_version
    FOREIGN KEY (tenant_id, document_id, version_id)
    REFERENCES document_versions (tenant_id, document_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_candidates_proposed_by
    FOREIGN KEY (tenant_id, proposed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_candidates_reviewed_by
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_knowledge_candidates_closing_binder
    FOREIGN KEY (tenant_id, closing_binder_id)
    REFERENCES closing_binders (tenant_id, closing_binder_id)
    ON DELETE RESTRICT,
  CONSTRAINT knowledge_candidates_review_consistency CHECK (
    (
      status = 'proposed'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND review_reason IS NULL
    )
    OR (
      status IN ('approved', 'rejected')
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL
    )
  )
);

CREATE INDEX idx_knowledge_candidates_tenant_status
  ON knowledge_candidates (tenant_id, status, updated_at DESC, candidate_id);

CREATE INDEX idx_knowledge_candidates_tenant_matter
  ON knowledge_candidates (tenant_id, matter_id, status, updated_at DESC);

CREATE INDEX idx_knowledge_candidates_tenant_document
  ON knowledge_candidates (tenant_id, document_id, version_id);

ALTER TABLE knowledge_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_knowledge_candidates_tenant ON knowledge_candidates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON knowledge_candidates TO vault_app;
GRANT UPDATE (
  status,
  reviewed_by,
  reviewed_at,
  review_reason,
  work_item_id,
  created_audit_event_id,
  last_audit_event_id,
  updated_at
) ON knowledge_candidates TO vault_app;

DO $$
DECLARE
  kind_values text[];
  kind_list text;
  target_values text[];
  target_list text;
BEGIN
  SELECT array_agg(kind_name ORDER BY kind_name)
  INTO kind_values
  FROM (
    SELECT DISTINCT match[1] AS kind_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_kind_check'
    UNION
    SELECT 'knowledge_candidate_review'
  ) kinds;

  SELECT string_agg(quote_literal(kind_name), ', ')
  INTO kind_list
  FROM unnest(kind_values) AS values(kind_name);

  SELECT array_agg(target_name ORDER BY target_name)
  INTO target_values
  FROM (
    SELECT DISTINCT match[1] AS target_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_target_type_check'
    UNION
    SELECT 'knowledge_candidate'
  ) targets;

  SELECT string_agg(quote_literal(target_name), ', ')
  INTO target_list
  FROM unnest(target_values) AS values(target_name);

  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_kind_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_kind_check CHECK (kind = ANY (ARRAY[' || kind_list || ']::text[]))';
  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_target_type_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_target_type_check CHECK (target_type = ANY (ARRAY[' || target_list || ']::text[]))';
END $$;

COMMENT ON TABLE knowledge_candidates IS
  'Tenant-scoped Matter close knowledge-bank candidate refs. Stores document/version IDs, candidate type, status, reviewer refs, and bounded rationale only; no document body, snippets, prompts, or model output.';
COMMENT ON COLUMN knowledge_candidates.review_reason IS
  'Bounded reviewer rationale for approval or rejection. Do not store document text or privileged content.';
COMMENT ON COLUMN work_items.kind IS
  'DMS work kind. knowledge_candidate_review rows point at knowledge_candidates and are completed by the Matter knowledge candidate review API.';

-- Down Migration

DELETE FROM work_items
WHERE kind = 'knowledge_candidate_review'
   OR target_type = 'knowledge_candidate';

DROP TABLE IF EXISTS knowledge_candidates;

DO $$
DECLARE
  kind_values text[];
  kind_list text;
  target_values text[];
  target_list text;
BEGIN
  SELECT array_agg(kind_name ORDER BY kind_name)
  INTO kind_values
  FROM (
    SELECT DISTINCT match[1] AS kind_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_kind_check'
      AND match[1] <> 'knowledge_candidate_review'
  ) kinds;

  SELECT string_agg(quote_literal(kind_name), ', ')
  INTO kind_list
  FROM unnest(kind_values) AS values(kind_name);

  SELECT array_agg(target_name ORDER BY target_name)
  INTO target_values
  FROM (
    SELECT DISTINCT match[1] AS target_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_target_type_check'
      AND match[1] <> 'knowledge_candidate'
  ) targets;

  SELECT string_agg(quote_literal(target_name), ', ')
  INTO target_list
  FROM unnest(target_values) AS values(target_name);

  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_kind_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_kind_check CHECK (kind = ANY (ARRAY[' || kind_list || ']::text[]))';
  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_target_type_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_target_type_check CHECK (target_type = ANY (ARRAY[' || target_list || ']::text[]))';
END $$;

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
        match[1] NOT IN ('KNOWLEDGE_CANDIDATE_PROPOSED', 'KNOWLEDGE_CANDIDATE_REVIEWED')
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
