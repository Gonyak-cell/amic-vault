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
    SELECT 'DOCUMENT_COMPARISON_CREATED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE document_version_comparisons (
  comparison_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  base_version_id uuid NOT NULL,
  target_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  requested_by uuid NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason_code text CHECK (
    failure_reason_code IS NULL OR failure_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  job_id text CHECK (
    job_id IS NULL OR (
      char_length(job_id) BETWEEN 1 AND 120
      AND job_id !~* '(password|secret|token)'
    )
  ),
  created_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, comparison_id),
  CONSTRAINT document_version_comparisons_distinct_versions
    CHECK (base_version_id <> target_version_id),
  CONSTRAINT fk_document_version_comparisons_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_version_comparisons_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_version_comparisons_base_version
    FOREIGN KEY (tenant_id, base_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_version_comparisons_target_version
    FOREIGN KEY (tenant_id, target_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_version_comparisons_requested_by
    FOREIGN KEY (tenant_id, requested_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_version_comparisons_audit_event
    FOREIGN KEY (tenant_id, created_audit_event_id)
    REFERENCES audit_events (tenant_id, event_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_version_comparisons_tenant_document
  ON document_version_comparisons (tenant_id, document_id, created_at DESC, comparison_id);

CREATE INDEX idx_document_version_comparisons_tenant_status
  ON document_version_comparisons (tenant_id, status, created_at DESC, comparison_id);

ALTER TABLE document_version_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_version_comparisons FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_version_comparisons_tenant ON document_version_comparisons
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_version_comparisons TO vault_app;
GRANT UPDATE (
  status,
  summary_json,
  failure_reason_code,
  job_id,
  created_audit_event_id,
  completed_at,
  updated_at
) ON document_version_comparisons TO vault_app;

CREATE TABLE comparison_clause_changes (
  change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  comparison_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  change_type text NOT NULL CHECK (change_type IN ('added', 'deleted', 'modified', 'unchanged')),
  clause_key text NOT NULL CHECK (
    char_length(clause_key) BETWEEN 1 AND 160
    AND clause_key !~* '(password|secret|token)'
  ),
  clause_number text NOT NULL CHECK (
    char_length(clause_number) BETWEEN 1 AND 80
    AND clause_number !~* '(password|secret|token)'
  ),
  heading_text text NOT NULL DEFAULT '' CHECK (char_length(heading_text) <= 240),
  base_start_offset integer CHECK (base_start_offset IS NULL OR base_start_offset >= 0),
  base_end_offset integer CHECK (base_end_offset IS NULL OR base_end_offset >= 0),
  target_start_offset integer CHECK (target_start_offset IS NULL OR target_start_offset >= 0),
  target_end_offset integer CHECK (target_end_offset IS NULL OR target_end_offset >= 0),
  base_text text NOT NULL DEFAULT '' CHECK (char_length(base_text) <= 32000),
  target_text text NOT NULL DEFAULT '' CHECK (char_length(target_text) <= 32000),
  base_text_hash char(64) CHECK (base_text_hash IS NULL OR base_text_hash ~ '^[0-9a-f]{64}$'),
  target_text_hash char(64) CHECK (target_text_hash IS NULL OR target_text_hash ~ '^[0-9a-f]{64}$'),
  diff_hunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  parser_version text NOT NULL CHECK (parser_version ~ '^b11-[a-z0-9.-]{1,32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, comparison_id, sequence_no),
  CONSTRAINT comparison_clause_changes_base_offsets
    CHECK (
      (base_start_offset IS NULL AND base_end_offset IS NULL)
      OR (base_start_offset IS NOT NULL AND base_end_offset IS NOT NULL AND base_start_offset <= base_end_offset)
    ),
  CONSTRAINT comparison_clause_changes_target_offsets
    CHECK (
      (target_start_offset IS NULL AND target_end_offset IS NULL)
      OR (target_start_offset IS NOT NULL AND target_end_offset IS NOT NULL AND target_start_offset <= target_end_offset)
    ),
  CONSTRAINT fk_comparison_clause_changes_comparison
    FOREIGN KEY (tenant_id, comparison_id)
    REFERENCES document_version_comparisons (tenant_id, comparison_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_comparison_clause_changes_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_comparison_clause_changes_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_comparison_clause_changes_tenant_comparison
  ON comparison_clause_changes (tenant_id, comparison_id, sequence_no);

ALTER TABLE comparison_clause_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_clause_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_comparison_clause_changes_tenant ON comparison_clause_changes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON comparison_clause_changes TO vault_app;

COMMENT ON TABLE document_version_comparisons IS
  'B11 document version comparison requests. Audit metadata stores reference IDs and counts only; comparison body snippets remain tenant-scoped under RLS.';

COMMENT ON TABLE comparison_clause_changes IS
  'B11 clause-level mechanical diff rows. Bounded clause text is stored for display; logs and audit metadata must not store body text or snippets.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (SELECT 1 FROM comparison_clause_changes LIMIT 1)
     OR EXISTS (SELECT 1 FROM document_version_comparisons LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot drop B11 document comparison rows once comparison data exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action = 'DOCUMENT_COMPARISON_CREATED'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove B11 document comparison audit action while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> 'DOCUMENT_COMPARISON_CREATED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS comparison_clause_changes;
DROP TABLE IF EXISTS document_version_comparisons;
