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
      'AI_PREP_REQUESTED',
      'AI_PREP_COMPLETED',
      'AI_PREP_BLOCKED',
      'AI_PREP_FAILED',
      'AI_PREP_REJECTED',
      'AI_PREP_STALE',
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
      'SSO_PROVIDER_CHANGED',
      'SSO_METADATA_VIEWED',
      'BYOK_KEY_REFERENCE_CHANGED',
      'SIEM_EXPORT_RECORDED',
      'BACKUP_SNAPSHOT_RECORDED',
      'COMPLIANCE_EVIDENCE_RECORDED',
      'ENTERPRISE_READINESS_VIEWED',
      'SCALE_PERFORMANCE_RECORDED',
      'SCALE_COST_SNAPSHOT_RECORDED',
      'SCALE_EVAL_RUN_RECORDED',
      'SCALE_MIGRATION_DRILL_RECORDED',
      'SCALE_LEARNING_EVENT_RECORDED',
      'ADVANCED_AI_GATE_REVIEWED',
      'SCALE_READINESS_VIEWED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED',
      'OUTLOOK_ADDIN_SESSION_EXCHANGED',
      'OUTLOOK_ADDIN_SESSION_DENIED',
      'OUTLOOK_EMAIL_FILE_REQUESTED',
      'OUTLOOK_EMAIL_FILE_COMPLETED',
      'OUTLOOK_EMAIL_FILE_DENIED',
      'OUTLOOK_EMAIL_FILE_FAILED',
      'OUTLOOK_EMAIL_FILE_CANCELLED',
      'OUTLOOK_ATTACHMENT_FILED',
      'OUTLOOK_MATTER_SUGGESTIONS_VIEWED',
      'OUTLOOK_SEND_FILE_REQUESTED',
      'OUTLOOK_SEND_FILE_DENIED',
      'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
      'OUTLOOK_DOCUMENT_INSERT_DENIED',
      'OUTLOOK_FOLDER_MAPPING_CHANGED',
      'OUTLOOK_AUTOFILE_JOB_RECORDED',
      'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED',
      'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED',
      'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED'
    )
  );

CREATE TABLE outlook_mailbox_bindings (
  binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, binding_id),
  UNIQUE (tenant_id, user_id, mailbox_fingerprint_hash),
  CONSTRAINT fk_outlook_mailbox_bindings_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_mailbox_bindings_tenant_user_status
  ON outlook_mailbox_bindings (tenant_id, user_id, status, updated_at DESC);

ALTER TABLE outlook_mailbox_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_mailbox_bindings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_mailbox_bindings_tenant ON outlook_mailbox_bindings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_mailbox_bindings TO vault_app;

COMMENT ON TABLE outlook_mailbox_bindings IS
  'Tenant-scoped Outlook mailbox-to-user binding. Stores mailbox fingerprint hashes only; raw mailbox addresses, account ids, provider ids, tokens, and Graph payloads are forbidden.';

CREATE TABLE outlook_addin_sessions (
  addin_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  binding_id uuid NOT NULL,
  source_session_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  identity_assertion_hash char(64) NOT NULL CHECK (identity_assertion_hash ~ '^[0-9a-f]{64}$'),
  identity_subject_hash char(64) NOT NULL CHECK (identity_subject_hash ~ '^[0-9a-f]{64}$'),
  tenant_hint_hash char(64) CHECK (tenant_hint_hash IS NULL OR tenant_hint_hash ~ '^[0-9a-f]{64}$'),
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  source_client text NOT NULL CHECK (source_client = 'outlook-web-addin'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'denied', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, addin_session_id),
  UNIQUE (tenant_id, user_id, client_request_id_hash),
  CONSTRAINT fk_outlook_addin_sessions_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_addin_sessions_binding
    FOREIGN KEY (tenant_id, binding_id)
    REFERENCES outlook_mailbox_bindings (tenant_id, binding_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_addin_sessions_source_session
    FOREIGN KEY (tenant_id, source_session_id)
    REFERENCES sessions (tenant_id, session_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_addin_sessions_tenant_user_active
  ON outlook_addin_sessions (tenant_id, user_id, expires_at DESC, addin_session_id)
  WHERE status = 'active';

ALTER TABLE outlook_addin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_addin_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_addin_sessions_tenant ON outlook_addin_sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_addin_sessions TO vault_app;

COMMENT ON TABLE outlook_addin_sessions IS
  'Separate Outlook add-in sessions issued after a server-approved identity exchange. Stores hashes and Vault refs only; access tokens, refresh tokens, cookies, raw identity assertions, and provider payloads are forbidden.';

COMMENT ON COLUMN outlook_addin_sessions.identity_assertion_hash IS
  'Hash of the transient identity assertion used for exchange. The assertion/token value itself must never be stored.';

CREATE TABLE outlook_graph_attachment_acquisitions (
  acquisition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  addin_session_id uuid NOT NULL,
  attachment_id_hash char(64) NOT NULL CHECK (attachment_id_hash ~ '^[0-9a-f]{64}$'),
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  canonical_message_sha256 char(64) NOT NULL CHECK (canonical_message_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'acquired', 'denied', 'failed')),
  denied_reason_code text CHECK (
    denied_reason_code IS NULL
    OR denied_reason_code IN (
      'permission_denied',
      'policy_denied',
      'stale_mailbox',
      'duplicate',
      'integration_gate_closed',
      'cancelled'
    )
  ),
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  graph_scope_set_hash char(64) NOT NULL CHECK (graph_scope_set_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, acquisition_id),
  UNIQUE (tenant_id, request_id, attachment_id_hash, client_request_id_hash),
  CONSTRAINT fk_outlook_graph_attachment_acquisitions_request
    FOREIGN KEY (tenant_id, request_id)
    REFERENCES outlook_filing_requests (tenant_id, request_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_graph_attachment_acquisitions_session
    FOREIGN KEY (tenant_id, addin_session_id)
    REFERENCES outlook_addin_sessions (tenant_id, addin_session_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_graph_attachment_acquisitions_request
  ON outlook_graph_attachment_acquisitions (tenant_id, request_id, created_at DESC);

ALTER TABLE outlook_graph_attachment_acquisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_graph_attachment_acquisitions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_graph_attachment_acquisitions_tenant
  ON outlook_graph_attachment_acquisitions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_graph_attachment_acquisitions TO vault_app;

COMMENT ON TABLE outlook_graph_attachment_acquisitions IS
  'Reference-only Outlook Graph attachment acquisition ledger. Stores hashes, counts, statuses, and Vault refs only; raw Graph ids, tokens, provider payloads, filenames, and attachment bytes are forbidden.';

-- Down Migration

DROP TABLE IF EXISTS outlook_graph_attachment_acquisitions;
DROP TABLE IF EXISTS outlook_addin_sessions;
DROP TABLE IF EXISTS outlook_mailbox_bindings;

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
      'AI_PREP_REQUESTED',
      'AI_PREP_COMPLETED',
      'AI_PREP_BLOCKED',
      'AI_PREP_FAILED',
      'AI_PREP_REJECTED',
      'AI_PREP_STALE',
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
      'SSO_PROVIDER_CHANGED',
      'SSO_METADATA_VIEWED',
      'BYOK_KEY_REFERENCE_CHANGED',
      'SIEM_EXPORT_RECORDED',
      'BACKUP_SNAPSHOT_RECORDED',
      'COMPLIANCE_EVIDENCE_RECORDED',
      'ENTERPRISE_READINESS_VIEWED',
      'SCALE_PERFORMANCE_RECORDED',
      'SCALE_COST_SNAPSHOT_RECORDED',
      'SCALE_EVAL_RUN_RECORDED',
      'SCALE_MIGRATION_DRILL_RECORDED',
      'SCALE_LEARNING_EVENT_RECORDED',
      'ADVANCED_AI_GATE_REVIEWED',
      'SCALE_READINESS_VIEWED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED',
      'OUTLOOK_EMAIL_FILE_REQUESTED',
      'OUTLOOK_EMAIL_FILE_COMPLETED',
      'OUTLOOK_EMAIL_FILE_DENIED',
      'OUTLOOK_EMAIL_FILE_FAILED',
      'OUTLOOK_EMAIL_FILE_CANCELLED',
      'OUTLOOK_ATTACHMENT_FILED',
      'OUTLOOK_MATTER_SUGGESTIONS_VIEWED',
      'OUTLOOK_SEND_FILE_REQUESTED',
      'OUTLOOK_SEND_FILE_DENIED',
      'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
      'OUTLOOK_DOCUMENT_INSERT_DENIED',
      'OUTLOOK_FOLDER_MAPPING_CHANGED',
      'OUTLOOK_AUTOFILE_JOB_RECORDED'
    )
  );
