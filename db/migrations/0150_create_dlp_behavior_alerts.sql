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
    SELECT 'DLP_BULK_DOWNLOAD_DETECTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE dlp_behavior_alerts (
  alert_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count > 0),
  total_bytes bigint NOT NULL CHECK (total_bytes >= 0),
  threshold_count integer NOT NULL CHECK (threshold_count > 0),
  threshold_bytes bigint NOT NULL CHECK (threshold_bytes > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'dismissed')),
  created_audit_event_id uuid,
  last_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_user_id, window_start),
  CONSTRAINT dlp_behavior_alerts_window_check CHECK (window_start < window_end),
  CONSTRAINT fk_dlp_behavior_alerts_actor
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dlp_behavior_alerts_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_dlp_behavior_alerts_tenant_status
  ON dlp_behavior_alerts (tenant_id, status, created_at DESC, alert_id);
CREATE INDEX idx_dlp_behavior_alerts_tenant_actor_window
  ON dlp_behavior_alerts (tenant_id, actor_user_id, window_end DESC, alert_id);

ALTER TABLE dlp_behavior_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_behavior_alerts FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dlp_behavior_alerts_tenant ON dlp_behavior_alerts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dlp_behavior_alerts TO vault_app;
GRANT UPDATE (
  status,
  created_audit_event_id,
  last_audit_event_id,
  updated_at
) ON dlp_behavior_alerts TO vault_app;

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

COMMENT ON TABLE dlp_behavior_alerts IS
  'Tenant-scoped DLP behavior alerts for threshold detection only. No raw document body, snippets, private endpoint, model response, or downloaded file content is stored.';
COMMENT ON COLUMN dlp_behavior_alerts.total_bytes IS
  'Aggregate bytes resolved from immutable downloaded version file_object references; raw file content is not stored.';

-- Down Migration

DELETE FROM notifications
WHERE kind = 'dlp_bulk_download'
   OR target_type = 'dlp_behavior_alert';

DROP TABLE IF EXISTS dlp_behavior_alerts;

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
        match[1] <> 'DLP_BULK_DOWNLOAD_DETECTED'
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
