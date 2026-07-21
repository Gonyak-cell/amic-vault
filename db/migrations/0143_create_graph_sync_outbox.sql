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
    SELECT 'GRAPH_SYNC_FAILED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE graph_sync_outbox (
  graph_sync_outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'dead_letter')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL
    OR last_error_code IN ('GRAPH_SYNC_FAILED', 'GRAPH_SYNC_RETRY_EXHAUSTED')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, graph_sync_outbox_id),
  CONSTRAINT fk_graph_sync_outbox_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_graph_sync_outbox_requested_by
    FOREIGN KEY (tenant_id, requested_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT graph_sync_outbox_reason_codes_check CHECK (
    cardinality(reason_codes) BETWEEN 1 AND 16
    AND reason_codes <@ ARRAY[
      'document_uploaded',
      'document_version_added',
      'document_deleted',
      'document_restored',
      'document_status_changed',
      'document_text_extracted',
      'litigation_fact_changed',
      'litigation_issue_changed',
      'dd_issue_changed',
      'dd_risk_changed'
    ]::text[]
  ),
  CONSTRAINT graph_sync_outbox_status_timestamp_check CHECK (
    (status = 'pending' AND completed_at IS NULL AND dead_lettered_at IS NULL)
    OR (status = 'processing' AND locked_at IS NOT NULL AND completed_at IS NULL AND dead_lettered_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND dead_lettered_at IS NULL)
    OR (status = 'dead_letter' AND dead_lettered_at IS NOT NULL)
  )
);

CREATE INDEX idx_graph_sync_outbox_pending
  ON graph_sync_outbox (tenant_id, next_attempt_at, updated_at)
  WHERE status = 'pending';

CREATE INDEX idx_graph_sync_outbox_matter_status
  ON graph_sync_outbox (tenant_id, matter_id, status, updated_at DESC);

ALTER TABLE graph_sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_sync_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_graph_sync_outbox_tenant ON graph_sync_outbox
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON graph_sync_outbox TO vault_app;
GRANT UPDATE (
  reason_codes,
  requested_by,
  status,
  attempt_count,
  next_attempt_at,
  locked_at,
  completed_at,
  dead_lettered_at,
  last_error_code,
  updated_at
) ON graph_sync_outbox TO vault_app;

COMMENT ON TABLE graph_sync_outbox IS
  'Tenant-scoped Postgres outbox for derived knowledge graph sync. Stores only matter refs, bounded reason codes, status, and retry counters; no document body, snippets, prompts, or raw error text.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
  keep_failed_action boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action = 'GRAPH_SYNC_FAILED'
    LIMIT 1
  ) INTO keep_failed_action;

  DROP TABLE IF EXISTS graph_sync_outbox;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND (keep_failed_action OR match[1] <> 'GRAPH_SYNC_FAILED')
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
