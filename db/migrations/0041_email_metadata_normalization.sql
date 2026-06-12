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
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED'
    )
  );

ALTER TABLE email_messages
  ADD COLUMN subject text CHECK (subject IS NULL OR char_length(subject) <= 500),
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN received_at timestamptz,
  ADD COLUMN metadata_warning_code text CHECK (
    metadata_warning_code IS NULL OR metadata_warning_code IN ('MALFORMED_DATE')
  ),
  ADD COLUMN references_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(references_json) = 'array'
    AND octet_length(references_json::text) <= 4096
  ),
  ADD COLUMN has_outside_participants boolean NOT NULL DEFAULT false;

CREATE TABLE email_participants (
  participant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('from', 'to', 'cc')),
  address_hash char(64) NOT NULL CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  domain_ref text NOT NULL CHECK (
    char_length(domain_ref) BETWEEN 1 AND 255
    AND domain_ref ~ '^[a-z0-9.-]+$'
  ),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 256),
  is_outside boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, participant_id),
  UNIQUE (tenant_id, email_id, role, address_hash),
  CONSTRAINT fk_email_participants_message
    FOREIGN KEY (tenant_id, email_id)
    REFERENCES email_messages (tenant_id, email_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_email_participants_tenant_email
  ON email_participants (tenant_id, email_id, role);

CREATE INDEX idx_email_participants_tenant_domain
  ON email_participants (tenant_id, domain_ref, role);

ALTER TABLE email_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_participants FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_participants_tenant ON email_participants
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON email_participants TO vault_app;

COMMENT ON COLUMN email_messages.subject IS
  'Bounded email subject metadata. Email body and raw header blocks must not be stored in this table.';

COMMENT ON COLUMN email_messages.references_json IS
  'Bounded array of SHA-256 hashes for References/In-Reply-To values. Raw Message-ID references must never be stored.';

COMMENT ON TABLE email_participants IS
  'Tenant-scoped email participant metadata. Raw email addresses are forbidden; store address_hash, domain_ref, bounded display_name, and display-only outside flag.';

-- Down Migration

DROP TABLE IF EXISTS email_participants;

ALTER TABLE email_messages
  DROP COLUMN IF EXISTS has_outside_participants,
  DROP COLUMN IF EXISTS references_json,
  DROP COLUMN IF EXISTS metadata_warning_code,
  DROP COLUMN IF EXISTS received_at,
  DROP COLUMN IF EXISTS sent_at,
  DROP COLUMN IF EXISTS subject;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After EMAIL_METADATA_UPDATED rows have been recorded,
-- rollback cannot safely remove the action from the allow-list.
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
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED'
    )
  );
