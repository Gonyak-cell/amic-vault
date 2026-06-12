-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED'
    )
  );

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_storage_uri_check;

ALTER TABLE file_objects
  ADD CONSTRAINT file_objects_storage_uri_check CHECK (
    storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/matters/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/[0-9a-f-]{36}$'
    OR storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/emails/[0-9a-f-]{36}/raw/[0-9a-f-]{36}$'
  );

CREATE TABLE email_messages (
  email_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  raw_file_object_id uuid NOT NULL,
  message_id_hash char(64) NOT NULL CHECK (message_id_hash ~ '^[0-9a-f]{64}$'),
  parser text NOT NULL CHECK (parser IN ('eml', 'msg')),
  parse_status text NOT NULL CHECK (parse_status IN ('parsed', 'pending_unsupported', 'failed')),
  failure_reason_code text CHECK (
    failure_reason_code IS NULL OR failure_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  raw_sha256 char(64) NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
  raw_size_bytes bigint NOT NULL CHECK (raw_size_bytes >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email_id),
  UNIQUE (tenant_id, message_id_hash),
  CONSTRAINT fk_email_messages_raw_file_object
    FOREIGN KEY (tenant_id, raw_file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_messages_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (parse_status = 'parsed' AND failure_reason_code IS NULL)
    OR (parse_status IN ('pending_unsupported', 'failed') AND failure_reason_code IS NOT NULL)
  )
);

CREATE INDEX idx_email_messages_tenant_created
  ON email_messages (tenant_id, created_at DESC, email_id);

CREATE INDEX idx_email_messages_tenant_raw_file
  ON email_messages (tenant_id, raw_file_object_id);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_messages_tenant ON email_messages
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON email_messages TO vault_app;

COMMENT ON TABLE email_messages IS
  'Tenant-scoped imported email envelopes. Raw email bytes are referenced through immutable file_objects only; headers, body text, and attachment content must not be stored here.';

COMMENT ON COLUMN email_messages.message_id_hash IS
  'SHA-256 hash of the normalized Message-ID for parsed EML, or raw object hash namespace for parser-failed/skeleton messages. Raw Message-ID must never be stored.';

COMMENT ON COLUMN email_messages.raw_sha256 IS
  'SHA-256 hash of immutable raw email bytes. Raw bytes live only in tenant-prefixed object storage.';

-- Down Migration

DROP TABLE IF EXISTS email_messages;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After EMAIL_* audit rows have been recorded,
-- rollback cannot safely remove EMAIL_* actions from the allow-list.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED'
    )
  );

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_storage_uri_check;

-- file_objects is immutable once referenced by audit/document/email evidence.
-- Keep the expanded path check so rollback cannot strand valid email_ingest file_objects.
ALTER TABLE file_objects
  ADD CONSTRAINT file_objects_storage_uri_check CHECK (
    storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/matters/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/[0-9a-f-]{36}$'
    OR storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/emails/[0-9a-f-]{36}/raw/[0-9a-f-]{36}$'
  );
