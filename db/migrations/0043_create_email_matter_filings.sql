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
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE email_matter_filings (
  filing_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, filing_id),
  UNIQUE (tenant_id, email_id, matter_id),
  CONSTRAINT fk_email_matter_filings_email
    FOREIGN KEY (tenant_id, email_id)
    REFERENCES email_messages (tenant_id, email_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_matter_filings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_matter_filings_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_email_matter_filings_tenant_matter
  ON email_matter_filings (tenant_id, matter_id, created_at DESC, filing_id);

CREATE INDEX idx_email_matter_filings_tenant_email
  ON email_matter_filings (tenant_id, email_id, created_at DESC);

ALTER TABLE email_matter_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_matter_filings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_matter_filings_tenant ON email_matter_filings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON email_matter_filings TO vault_app;

COMMENT ON TABLE email_matter_filings IS
  'Tenant-scoped manual email-to-matter filing records. Stores references only; raw email body, headers, participant addresses, and attachment bytes are forbidden.';

COMMENT ON COLUMN email_matter_filings.email_id IS
  'Reference to the imported email envelope. Filing audit metadata uses this id as scope_id only.';

-- Down Migration

DROP TABLE IF EXISTS email_matter_filings;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After EMAIL_FILED rows have been recorded,
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
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
