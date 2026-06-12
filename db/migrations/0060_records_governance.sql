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
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'CONTRACT_CLASSIFIED',
      'CONTRACT_CLAUSES_EXTRACTED',
      'CONTRACT_TERMS_EXTRACTED',
      'CONTRACT_REDLINE_PARSED',
      'PLAYBOOK_RULE_CHANGED',
      'CONTRACT_RULE_EVALUATED',
      'CONTRACT_CLAUSE_BANK_VIEWED',
      'DD_RFI_CHANGED',
      'DD_DATA_ROOM_MAPPED',
      'DD_ISSUE_CHANGED',
      'DD_RISK_CHANGED',
      'DD_TRACE_VIEWED',
      'LIT_EVIDENCE_CHANGED',
      'LIT_FACT_CHANGED',
      'LIT_ISSUE_TREE_CHANGED',
      'LIT_PLEADING_CHANGED',
      'LIT_CASE_MAP_VIEWED',
      'EXTERNAL_USER_CHANGED',
      'EXTERNAL_WORKSPACE_CHANGED',
      'EXTERNAL_LINK_CREATED',
      'EXTERNAL_LINK_REVOKED',
      'EXTERNAL_LINK_ACCESSED',
      'EXTERNAL_NDA_ACCEPTED',
      'EXTERNAL_DLP_WARNING_BLOCKED',
      'EXTERNAL_DLP_WARNING_ACCEPTED',
      'EXTERNAL_DOWNLOAD_REQUESTED',
      'EXTERNAL_QA_MESSAGE_RECORDED',
      'RETENTION_POLICY_CHANGED',
      'LEGAL_HOLD_APPLIED',
      'LEGAL_HOLD_RELEASED',
      'RECORD_ARCHIVED',
      'DISPOSAL_REQUESTED',
      'DISPOSAL_APPROVED',
      'DISPOSAL_EXECUTED',
      'DISPOSAL_CERTIFICATE_CREATED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE OR REPLACE FUNCTION file_objects_block_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.records_disposal_executor', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'file_objects immutable original row: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TABLE retention_policies (
  retention_policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  policy_code text NOT NULL CHECK (policy_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  label text NOT NULL CHECK (
    char_length(label) BETWEEN 1 AND 200
    AND label !~* '(password|secret|token|api[_ -]?key|body|snippet|raw)'
  ),
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 36500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, retention_policy_id),
  UNIQUE (tenant_id, policy_code),
  CONSTRAINT fk_retention_policies_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_retention_policies_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_retention_policies_tenant_status
  ON retention_policies (tenant_id, status, policy_code);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_retention_policies_tenant ON retention_policies
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON retention_policies TO vault_app;
GRANT UPDATE (label, retention_days, status, updated_by, updated_at) ON retention_policies TO vault_app;

CREATE TABLE legal_holds (
  legal_hold_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid,
  hold_scope text NOT NULL CHECK (hold_scope IN ('matter', 'document')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  created_by uuid NOT NULL,
  released_by uuid,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, legal_hold_id),
  CONSTRAINT legal_holds_scope_check CHECK (
    (hold_scope = 'matter' AND document_id IS NULL)
    OR (hold_scope = 'document' AND document_id IS NOT NULL)
  ),
  CONSTRAINT legal_holds_release_check CHECK (
    (status = 'active' AND released_by IS NULL AND released_at IS NULL)
    OR (status = 'released' AND released_by IS NOT NULL AND released_at IS NOT NULL)
  ),
  CONSTRAINT fk_legal_holds_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_legal_holds_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_legal_holds_released_by
    FOREIGN KEY (tenant_id, released_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_legal_holds_active_matter
  ON legal_holds (tenant_id, matter_id)
  WHERE hold_scope = 'matter' AND status = 'active';

CREATE UNIQUE INDEX uq_legal_holds_active_document
  ON legal_holds (tenant_id, document_id)
  WHERE hold_scope = 'document' AND status = 'active';

CREATE INDEX idx_legal_holds_tenant_matter
  ON legal_holds (tenant_id, matter_id, status, created_at DESC);

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_holds FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_legal_holds_tenant ON legal_holds
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON legal_holds TO vault_app;
GRANT UPDATE (status, released_by, released_at, updated_at) ON legal_holds TO vault_app;

CREATE TABLE records_archives (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  previous_status text NOT NULL CHECK (
    previous_status IN (
      'draft',
      'internal_review',
      'client_sent',
      'counterparty_sent',
      'markup_received',
      'negotiation',
      'final',
      'executed'
    )
  ),
  archive_status text NOT NULL DEFAULT 'archived' CHECK (archive_status = 'archived'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  archived_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, archive_id),
  UNIQUE (tenant_id, document_id),
  CONSTRAINT fk_records_archives_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_records_archives_archived_by
    FOREIGN KEY (tenant_id, archived_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE records_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_archives FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_records_archives_tenant ON records_archives
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON records_archives TO vault_app;

CREATE TABLE disposal_requests (
  disposal_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'executed', 'rejected')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  requested_by uuid NOT NULL,
  approved_by uuid,
  executed_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, disposal_request_id),
  CONSTRAINT disposal_requests_state_consistency_check CHECK (
    (status = 'requested' AND approved_by IS NULL AND approved_at IS NULL AND executed_by IS NULL AND executed_at IS NULL)
    OR (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND executed_by IS NULL AND executed_at IS NULL)
    OR (status = 'executed' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND executed_by IS NOT NULL AND executed_at IS NOT NULL)
    OR (status = 'rejected')
  ),
  CONSTRAINT fk_disposal_requests_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_requests_requested_by
    FOREIGN KEY (tenant_id, requested_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_requests_approved_by
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_requests_executed_by
    FOREIGN KEY (tenant_id, executed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_disposal_requests_tenant_document
  ON disposal_requests (tenant_id, document_id, status, created_at DESC);

CREATE UNIQUE INDEX uq_disposal_requests_active_document
  ON disposal_requests (tenant_id, document_id)
  WHERE status IN ('requested', 'approved');

ALTER TABLE disposal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_disposal_requests_tenant ON disposal_requests
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON disposal_requests TO vault_app;
GRANT UPDATE (status, approved_by, executed_by, approved_at, executed_at, updated_at) ON disposal_requests TO vault_app;

CREATE TABLE disposal_certificates (
  certificate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  disposal_request_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_hash char(64) NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  certificate_hash char(64) NOT NULL CHECK (certificate_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid NOT NULL,
  executed_by uuid NOT NULL,
  executed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, certificate_id),
  UNIQUE (tenant_id, disposal_request_id),
  CONSTRAINT fk_disposal_certificates_request
    FOREIGN KEY (tenant_id, disposal_request_id)
    REFERENCES disposal_requests (tenant_id, disposal_request_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_certificates_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_certificates_approved_by
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_certificates_executed_by
    FOREIGN KEY (tenant_id, executed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE disposal_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_certificates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_disposal_certificates_tenant ON disposal_certificates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON disposal_certificates TO vault_app;

COMMENT ON TABLE retention_policies IS
  'R12 tenant records retention policy catalog. NULL retention_days means indefinite retention; automatic deletion is not implemented.';
COMMENT ON TABLE legal_holds IS
  'R12 legal hold workflow records. document_id is retained as a reference so hold history survives controlled disposal.';
COMMENT ON TABLE disposal_requests IS
  'R12 disposal workflow. Hard delete is allowed only after approved status and service preconditions.';
COMMENT ON TABLE disposal_certificates IS
  'R12 disposal certificate with reference IDs and hashes only; no document body, title, filename, or snippet.';

-- Down Migration

DROP TABLE IF EXISTS disposal_certificates;
DROP TABLE IF EXISTS disposal_requests;
DROP TABLE IF EXISTS records_archives;
DROP TABLE IF EXISTS legal_holds;
DROP TABLE IF EXISTS retention_policies;

CREATE OR REPLACE FUNCTION file_objects_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'file_objects immutable original row: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R12 records rows have been recorded,
-- rollback cannot safely remove these actions from the allow-list.
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
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'CONTRACT_CLASSIFIED',
      'CONTRACT_CLAUSES_EXTRACTED',
      'CONTRACT_TERMS_EXTRACTED',
      'CONTRACT_REDLINE_PARSED',
      'PLAYBOOK_RULE_CHANGED',
      'CONTRACT_RULE_EVALUATED',
      'CONTRACT_CLAUSE_BANK_VIEWED',
      'DD_RFI_CHANGED',
      'DD_DATA_ROOM_MAPPED',
      'DD_ISSUE_CHANGED',
      'DD_RISK_CHANGED',
      'DD_TRACE_VIEWED',
      'LIT_EVIDENCE_CHANGED',
      'LIT_FACT_CHANGED',
      'LIT_ISSUE_TREE_CHANGED',
      'LIT_PLEADING_CHANGED',
      'LIT_CASE_MAP_VIEWED',
      'EXTERNAL_USER_CHANGED',
      'EXTERNAL_WORKSPACE_CHANGED',
      'EXTERNAL_LINK_CREATED',
      'EXTERNAL_LINK_REVOKED',
      'EXTERNAL_LINK_ACCESSED',
      'EXTERNAL_NDA_ACCEPTED',
      'EXTERNAL_DLP_WARNING_BLOCKED',
      'EXTERNAL_DLP_WARNING_ACCEPTED',
      'EXTERNAL_DOWNLOAD_REQUESTED',
      'EXTERNAL_QA_MESSAGE_RECORDED',
      'RETENTION_POLICY_CHANGED',
      'LEGAL_HOLD_APPLIED',
      'LEGAL_HOLD_RELEASED',
      'RECORD_ARCHIVED',
      'DISPOSAL_REQUESTED',
      'DISPOSAL_APPROVED',
      'DISPOSAL_EXECUTED',
      'DISPOSAL_CERTIFICATE_CREATED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
