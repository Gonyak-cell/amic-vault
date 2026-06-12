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
      'DLP_FINDING_RECORDED'
    )
  );

CREATE TABLE dlp_findings (
  finding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('document', 'email', 'attachment', 'text')),
  source_id uuid NOT NULL,
  matter_id uuid NULL,
  document_id uuid NULL,
  version_id uuid NULL,
  rule_id text NOT NULL CHECK (rule_id IN (
    'kr-rrn-format-v1',
    'bank-account-format-v1',
    'email-address-format-v1',
    'kr-phone-format-v1'
  )),
  finding_type text NOT NULL CHECK (finding_type IN (
    'korean_resident_id',
    'bank_account',
    'email_address',
    'phone_number'
  )),
  value_hash char(64) NOT NULL CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, rule_id, value_hash, start_offset)
);

CREATE INDEX idx_dlp_findings_tenant_source
  ON dlp_findings (tenant_id, source_type, source_id, created_at DESC);

CREATE INDEX idx_dlp_findings_tenant_document
  ON dlp_findings (tenant_id, document_id, version_id, created_at DESC)
  WHERE document_id IS NOT NULL;

CREATE INDEX idx_dlp_findings_tenant_type
  ON dlp_findings (tenant_id, finding_type, status, created_at DESC);

ALTER TABLE dlp_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dlp_findings_tenant ON dlp_findings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dlp_findings TO vault_app;

COMMENT ON TABLE dlp_findings IS
  'R4 DLP findings. Raw sensitive values, snippets, document bodies, and email bodies are forbidden; store hashes and source references only.';

COMMENT ON COLUMN dlp_findings.value_hash IS
  'SHA-256 hash of rule id plus normalized detected value. The raw detected value must never be stored.';

COMMENT ON COLUMN dlp_findings.evidence_hash IS
  'SHA-256 hash of bounded local context for de-duplication and review correlation. Raw context must never be stored.';

-- Down Migration

DROP TABLE IF EXISTS dlp_findings;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After DLP audit rows have been recorded,
-- rollback cannot safely remove DLP_* actions from the allow-list.
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
      'DLP_FINDING_RECORDED'
    )
  );
