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
    SELECT 'LIT_HEARING_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE litigation_hearings (
  hearing_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  pleading_id uuid,
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 200
    AND title !~* '(password|secret|token)'
  ),
  hearing_type text NOT NULL DEFAULT 'hearing' CHECK (
    hearing_type IN ('hearing', 'deadline', 'trial', 'mediation', 'conference', 'other')
  ),
  scheduled_at timestamptz NOT NULL,
  court_name text CHECK (
    court_name IS NULL
    OR (
      char_length(court_name) BETWEEN 1 AND 200
      AND court_name !~* '(password|secret|token)'
    )
  ),
  location text CHECK (
    location IS NULL
    OR (
      char_length(location) BETWEEN 1 AND 200
      AND location !~* '(password|secret|token)'
    )
  ),
  internal_deadline date,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, hearing_id),
  CONSTRAINT litigation_hearings_deadline_before_hearing_check CHECK (
    internal_deadline IS NULL OR internal_deadline <= scheduled_at::date
  ),
  CONSTRAINT fk_litigation_hearings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_hearings_pleading
    FOREIGN KEY (tenant_id, pleading_id)
    REFERENCES litigation_pleadings (tenant_id, pleading_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_hearings_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_hearings_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_hearings_tenant_matter
  ON litigation_hearings (tenant_id, matter_id, status, scheduled_at ASC, hearing_id);
CREATE INDEX idx_litigation_hearings_tenant_pleading
  ON litigation_hearings (tenant_id, pleading_id)
  WHERE pleading_id IS NOT NULL;

ALTER TABLE litigation_hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_hearings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_hearings_tenant ON litigation_hearings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_hearings TO vault_app;
GRANT UPDATE (
  pleading_id,
  title,
  hearing_type,
  scheduled_at,
  court_name,
  location,
  internal_deadline,
  status,
  updated_by,
  updated_at
) ON litigation_hearings TO vault_app;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'edit_lock_expired',
      'edit_lock_released',
      'break_glass_approval_requested',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready',
      'dd_rfi_overdue',
      'dd_rfi_unmapped',
      'litigation_deadline'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_target_type_check CHECK (
    target_type IN (
      'document',
      'document_version',
      'legal_hold',
      'disposal_request',
      'work_item',
      'break_glass_request',
      'dd_rfi',
      'litigation_hearing'
    )
  );

COMMENT ON TABLE litigation_hearings IS
  'Internal litigation hearing and deadline tracking only. Court e-filing, calendar sync, external delivery, secure links, external portal, and VDR behavior are not represented here.';
COMMENT ON COLUMN litigation_hearings.title IS
  'Short internal label for the hearing or deadline. No document body, prompt, model response, or secret may be stored.';

-- Down Migration

DELETE FROM notifications
WHERE kind = 'litigation_deadline'
   OR target_type = 'litigation_hearing';

DELETE FROM work_items wi
WHERE wi.kind = 'litigation_deadline'
  AND wi.target_type = 'litigation_key_date'
  AND EXISTS (
    SELECT 1
    FROM litigation_hearings lh
    WHERE lh.tenant_id = wi.tenant_id
      AND lh.hearing_id = wi.target_id
  );

DROP TABLE IF EXISTS litigation_hearings;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_target_type_check CHECK (
    target_type IN (
      'document',
      'document_version',
      'legal_hold',
      'disposal_request',
      'work_item',
      'break_glass_request',
      'dd_rfi'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'edit_lock_expired',
      'edit_lock_released',
      'break_glass_approval_requested',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready',
      'dd_rfi_overdue',
      'dd_rfi_unmapped'
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
        match[1] <> 'LIT_HEARING_CHANGED'
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
