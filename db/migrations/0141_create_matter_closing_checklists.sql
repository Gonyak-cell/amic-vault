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
    SELECT 'MATTER_CLOSING_CHECKLIST_EVALUATED'
    UNION
    SELECT 'MATTER_CLOSING_CHECKLIST_WAIVED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE matter_closing_checklists (
  checklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  item_code text NOT NULL CHECK (
    item_code IN (
      'execution_copy_designated',
      'official_final_version',
      'legal_hold_clear',
      'external_links_clear',
      'issues_resolved'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'waived')),
  reason_code text NOT NULL DEFAULT 'not_evaluated' CHECK (
    char_length(reason_code) BETWEEN 1 AND 80
    AND reason_code ~ '^[a-z0-9_:-]+$'
  ),
  evidence_ref text CHECK (
    evidence_ref IS NULL OR (
      char_length(evidence_ref) BETWEEN 1 AND 160
      AND evidence_ref !~* '(password|secret|token)'
    )
  ),
  waived_by uuid,
  waived_reason text CHECK (
    waived_reason IS NULL OR (
      char_length(waived_reason) BETWEEN 8 AND 500
      AND waived_reason !~* '(password|secret|token)'
    )
  ),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matter_id, item_code),
  UNIQUE (tenant_id, checklist_item_id),
  CONSTRAINT fk_matter_closing_checklists_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_closing_checklists_waived_by
    FOREIGN KEY (tenant_id, waived_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT matter_closing_checklists_waive_consistency CHECK (
    (status = 'waived' AND waived_by IS NOT NULL AND waived_reason IS NOT NULL)
    OR (status <> 'waived' AND waived_by IS NULL AND waived_reason IS NULL)
  )
);

CREATE INDEX idx_matter_closing_checklists_matter
  ON matter_closing_checklists (tenant_id, matter_id, status, item_code);

ALTER TABLE matter_closing_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_closing_checklists FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_closing_checklists_tenant ON matter_closing_checklists
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON matter_closing_checklists TO vault_app;
GRANT UPDATE (
  status,
  reason_code,
  evidence_ref,
  waived_by,
  waived_reason,
  evaluated_at,
  updated_at
) ON matter_closing_checklists TO vault_app;

COMMENT ON TABLE matter_closing_checklists IS
  'Matter closing gate checklist. Rows contain bounded reason codes and opaque evidence refs only, never document body text.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN (
      'MATTER_CLOSING_CHECKLIST_EVALUATED',
      'MATTER_CLOSING_CHECKLIST_WAIVED'
    )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove A11 matter closing audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] NOT IN (
        'MATTER_CLOSING_CHECKLIST_EVALUATED',
        'MATTER_CLOSING_CHECKLIST_WAIVED'
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS matter_closing_checklists;
