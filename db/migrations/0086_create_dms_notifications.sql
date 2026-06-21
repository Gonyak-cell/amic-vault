-- Up Migration

CREATE TABLE notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('operational_data', 'records')),
  kind text NOT NULL CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready'
    )
  ),
  target_type text NOT NULL CHECK (
    target_type IN ('document', 'document_version', 'legal_hold', 'disposal_request', 'work_item')
  ),
  target_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid,
  recipient_scope text NOT NULL CHECK (recipient_scope IN ('user', 'records_admin')),
  recipient_user_id uuid,
  recipient_key text NOT NULL CHECK (char_length(recipient_key) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'dismissed', 'cancelled')),
  occurred_at timestamptz NOT NULL,
  read_by uuid,
  read_at timestamptz,
  dismissed_by uuid,
  dismissed_at timestamptz,
  created_audit_event_id uuid NOT NULL,
  last_audit_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, notification_id),
  CONSTRAINT notifications_recipient_check CHECK (
    (
      recipient_scope = 'user'
      AND recipient_user_id IS NOT NULL
      AND recipient_key = ('user:' || recipient_user_id::text)
    )
    OR (
      recipient_scope = 'records_admin'
      AND recipient_user_id IS NULL
      AND recipient_key = 'records_admin'
    )
  ),
  CONSTRAINT notifications_read_state_check CHECK (
    (status <> 'read' AND read_by IS NULL AND read_at IS NULL)
    OR (status = 'read' AND read_by IS NOT NULL AND read_at IS NOT NULL)
  ),
  CONSTRAINT notifications_dismiss_state_check CHECK (
    (status <> 'dismissed' AND dismissed_by IS NULL AND dismissed_at IS NULL)
    OR (status = 'dismissed' AND dismissed_by IS NOT NULL AND dismissed_at IS NOT NULL)
  ),
  CONSTRAINT fk_notifications_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_notifications_recipient_user
    FOREIGN KEY (tenant_id, recipient_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_notifications_read_by
    FOREIGN KEY (tenant_id, read_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_notifications_dismissed_by
    FOREIGN KEY (tenant_id, dismissed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_notifications_target_recipient
  ON notifications (
    tenant_id,
    source,
    kind,
    target_type,
    target_id,
    recipient_key
  );

CREATE INDEX idx_notifications_tenant_recipient_status
  ON notifications (tenant_id, recipient_key, status, occurred_at DESC, notification_id);

CREATE INDEX idx_notifications_tenant_target
  ON notifications (tenant_id, target_type, target_id, source, kind);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_notifications_tenant ON notifications
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON notifications TO vault_app;
GRANT UPDATE (
  status,
  read_by,
  read_at,
  dismissed_by,
  dismissed_at,
  occurred_at,
  last_audit_event_id,
  updated_at
) ON notifications TO vault_app;

COMMENT ON TABLE notifications IS
  'Tenant-scoped persisted DMS notification state. Rows store workflow/status references only; display labels are computed through permission-scoped target joins.';
COMMENT ON COLUMN notifications.target_id IS
  'Reference-only target UUID interpreted by target_type. Targets are joined before display; no document body, snippet, prompt, model response, or private endpoint is stored.';
COMMENT ON COLUMN notifications.document_id IS
  'Reference-only document UUID. No FK so approved records disposal can delete document/file rows while retaining notification history.';
COMMENT ON COLUMN notifications.created_audit_event_id IS
  'Reference-only audit event UUID. No FK so audit_events append-only enforcement remains authoritative.';
COMMENT ON COLUMN notifications.last_audit_event_id IS
  'Reference-only audit event UUID for the latest real source event represented by this notification.';

-- Down Migration

DROP TABLE IF EXISTS notifications;
