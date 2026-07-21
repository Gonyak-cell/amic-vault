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
    SELECT 'EMAIL_FILING_REVERTED'
    UNION
    SELECT 'EMAIL_SUGGESTION_AUTOFILED'
    UNION
    SELECT 'EMAIL_SUGGESTION_FEEDBACK_RECORDED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE email_suggestion_feedback (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email_id uuid NOT NULL,
  suggested_matter_id uuid,
  selected_matter_id uuid,
  action text NOT NULL CHECK (action IN ('accepted', 'changed', 'rejected', 'undone')),
  confidence_band text CHECK (
    confidence_band IS NULL OR confidence_band IN ('auto_file', 'confirm', 'candidate', 'manual')
  ),
  confidence_score integer CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(reason_codes) <= 12
    AND reason_codes <@ ARRAY[
      'thread',
      'sender_history',
      'participant_domain',
      'participant_class',
      'subject',
      'opposing_signal'
    ]::text[]
  ),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feedback_id),
  CONSTRAINT fk_email_suggestion_feedback_email
    FOREIGN KEY (tenant_id, email_id)
    REFERENCES email_messages (tenant_id, email_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_suggestion_feedback_suggested_matter
    FOREIGN KEY (tenant_id, suggested_matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_suggestion_feedback_selected_matter
    FOREIGN KEY (tenant_id, selected_matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_suggestion_feedback_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_email_suggestion_feedback_tenant_email
  ON email_suggestion_feedback (tenant_id, email_id, created_at DESC, feedback_id);

CREATE INDEX idx_email_suggestion_feedback_tenant_selected
  ON email_suggestion_feedback (tenant_id, selected_matter_id, action, created_at DESC)
  WHERE selected_matter_id IS NOT NULL;

ALTER TABLE email_suggestion_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suggestion_feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_suggestion_feedback_tenant ON email_suggestion_feedback
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON email_suggestion_feedback TO vault_app;

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
      'litigation_deadline',
      'dlp_bulk_download',
      'email_autofile_completed'
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
      'litigation_hearing',
      'dlp_behavior_alert',
      'email'
    )
  );

COMMENT ON TABLE email_suggestion_feedback IS
  'C13 bounded feedback for email filing suggestions. Stores only email/matter references, band, score, and reason codes; no raw email subject, body, headers, addresses, prompts, or snippets.';

-- Down Migration

DELETE FROM notifications
WHERE kind = 'email_autofile_completed'
   OR target_type = 'email';

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
      'litigation_hearing',
      'dlp_behavior_alert'
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
      'dd_rfi_unmapped',
      'litigation_deadline',
      'dlp_bulk_download'
    )
  );

DROP TABLE IF EXISTS email_suggestion_feedback;

DO $$
DECLARE
  action_values text[];
  action_list text;
  keep_reverted boolean;
  keep_autofiled boolean;
  keep_feedback boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM audit_events WHERE action = 'EMAIL_FILING_REVERTED' LIMIT 1
  ) INTO keep_reverted;
  SELECT EXISTS (
    SELECT 1 FROM audit_events WHERE action = 'EMAIL_SUGGESTION_AUTOFILED' LIMIT 1
  ) INTO keep_autofiled;
  SELECT EXISTS (
    SELECT 1 FROM audit_events WHERE action = 'EMAIL_SUGGESTION_FEEDBACK_RECORDED' LIMIT 1
  ) INTO keep_feedback;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND (
        match[1] NOT IN (
          'EMAIL_FILING_REVERTED',
          'EMAIL_SUGGESTION_AUTOFILED',
          'EMAIL_SUGGESTION_FEEDBACK_RECORDED'
        )
        OR (match[1] = 'EMAIL_FILING_REVERTED' AND keep_reverted)
        OR (match[1] = 'EMAIL_SUGGESTION_AUTOFILED' AND keep_autofiled)
        OR (match[1] = 'EMAIL_SUGGESTION_FEEDBACK_RECORDED' AND keep_feedback)
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
