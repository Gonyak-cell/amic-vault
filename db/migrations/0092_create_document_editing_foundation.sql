-- Up Migration

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_source_system_check,
  ADD CONSTRAINT file_objects_source_system_check CHECK (
    source_system IN ('upload', 'email_ingest', 'migration', 'preview_derived', 'document_edit')
  );

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
      'ACCOUNT_LEDGER_ID_ASSIGNED',
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
      'DOCUMENT_CHECKED_OUT',
      'DOCUMENT_SUBVERSION_SAVED',
      'DOCUMENT_CHECKIN_CANCELLED',
      'DOCUMENT_CHECKED_IN',
      'DOCUMENT_VERSION_PROMOTED',
      'DOCUMENT_EDIT_CONFLICT',
      'DOCUMENT_LOCK_EXPIRED',
      'DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED',
      'DOCUMENT_SUBVERSION_REVIEWER_REVOKED',
      'DOCUMENT_SUBVERSION_REVIEW_SUBMITTED',
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
      'ENTERPRISE_DMS_CONFIGURATION_CHANGED',
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
      'OUTLOOK_SEND_POLICY_EVALUATED',
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

CREATE TABLE document_edit_sessions (
  edit_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  base_version_id uuid NOT NULL,
  lock_owner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'checked_in', 'cancelled', 'expired', 'conflicted')),
  client_kind text NOT NULL DEFAULT 'web_upload'
    CHECK (client_kind IN ('web_upload', 'office_web', 'office_desktop', 'outlook')),
  lock_token_hash char(64) NOT NULL CHECK (lock_token_hash ~ '^[0-9a-f]{64}$'),
  checkout_reason_code text CHECK (
    checkout_reason_code IS NULL OR checkout_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  cancelled_reason_code text CHECK (
    cancelled_reason_code IS NULL OR cancelled_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  conflicted_at timestamptz,
  created_audit_event_id uuid,
  last_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, edit_session_id),
  CONSTRAINT document_edit_sessions_status_timestamp_check CHECK (
    (status = 'active' AND checked_in_at IS NULL AND cancelled_at IS NULL AND expired_at IS NULL AND conflicted_at IS NULL)
    OR (status = 'checked_in' AND checked_in_at IS NOT NULL AND cancelled_at IS NULL AND expired_at IS NULL AND conflicted_at IS NULL)
    OR (status = 'cancelled' AND checked_in_at IS NULL AND cancelled_at IS NOT NULL AND expired_at IS NULL AND conflicted_at IS NULL)
    OR (status = 'expired' AND checked_in_at IS NULL AND cancelled_at IS NULL AND expired_at IS NOT NULL AND conflicted_at IS NULL)
    OR (status = 'conflicted' AND checked_in_at IS NULL AND cancelled_at IS NULL AND expired_at IS NULL AND conflicted_at IS NOT NULL)
  ),
  CONSTRAINT fk_document_edit_sessions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_edit_sessions_base_version
    FOREIGN KEY (tenant_id, base_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_edit_sessions_owner
    FOREIGN KEY (tenant_id, lock_owner_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_document_edit_sessions_active_lock
  ON document_edit_sessions (tenant_id, document_id)
  WHERE status = 'active';

CREATE INDEX idx_document_edit_sessions_tenant_owner
  ON document_edit_sessions (tenant_id, lock_owner_user_id, status, updated_at DESC);

ALTER TABLE document_edit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_edit_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_edit_sessions_tenant ON document_edit_sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_edit_sessions TO vault_app;
GRANT UPDATE (
  status,
  heartbeat_at,
  expires_at,
  checked_in_at,
  cancelled_at,
  expired_at,
  conflicted_at,
  created_audit_event_id,
  cancelled_reason_code,
  last_audit_event_id,
  updated_at
) ON document_edit_sessions TO vault_app;

CREATE TABLE document_subversions (
  subversion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  base_version_id uuid NOT NULL,
  edit_session_id uuid NOT NULL,
  subversion_no integer NOT NULL CHECK (subversion_no > 0),
  file_object_id uuid NOT NULL,
  file_hash char(64) NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'submitted', 'abandoned', 'promoted')),
  visibility_scope text NOT NULL DEFAULT 'session_owner'
    CHECK (visibility_scope IN ('session_owner', 'reviewers', 'matter_owners', 'matter_editors')),
  save_reason_code text CHECK (
    save_reason_code IS NULL OR save_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  client_save_id text CHECK (
    client_save_id IS NULL OR client_save_id ~ '^[A-Za-z0-9._:-]{8,160}$'
  ),
  created_by uuid NOT NULL,
  submitted_by uuid,
  promoted_by uuid,
  promoted_version_id uuid,
  submitted_at timestamptz,
  promoted_at timestamptz,
  abandoned_at timestamptz,
  last_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subversion_id),
  UNIQUE (tenant_id, base_version_id, subversion_no),
  UNIQUE (tenant_id, file_object_id),
  UNIQUE (tenant_id, promoted_version_id),
  CONSTRAINT document_subversions_status_timestamp_check CHECK (
    (status = 'saved' AND submitted_at IS NULL AND promoted_at IS NULL AND abandoned_at IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND promoted_at IS NULL AND abandoned_at IS NULL)
    OR (status = 'promoted' AND submitted_at IS NOT NULL AND promoted_at IS NOT NULL AND abandoned_at IS NULL AND promoted_version_id IS NOT NULL)
    OR (status = 'abandoned' AND abandoned_at IS NOT NULL AND promoted_at IS NULL AND promoted_version_id IS NULL)
  ),
  CONSTRAINT fk_document_subversions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_base_version
    FOREIGN KEY (tenant_id, base_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_edit_session
    FOREIGN KEY (tenant_id, edit_session_id)
    REFERENCES document_edit_sessions (tenant_id, edit_session_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_submitted_by
    FOREIGN KEY (tenant_id, submitted_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_promoted_by
    FOREIGN KEY (tenant_id, promoted_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversions_promoted_version
    FOREIGN KEY (tenant_id, promoted_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_subversions_tenant_document
  ON document_subversions (tenant_id, document_id, base_version_id, subversion_no DESC);

CREATE INDEX idx_document_subversions_tenant_session
  ON document_subversions (tenant_id, edit_session_id, created_at DESC);

CREATE UNIQUE INDEX idx_document_subversions_client_save_id
  ON document_subversions (tenant_id, edit_session_id, client_save_id)
  WHERE client_save_id IS NOT NULL;

ALTER TABLE document_subversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_subversions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_subversions_tenant ON document_subversions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_subversions TO vault_app;
GRANT UPDATE (
  status,
  visibility_scope,
  submitted_by,
  promoted_by,
  promoted_version_id,
  submitted_at,
  promoted_at,
  abandoned_at,
  last_audit_event_id,
  updated_at
) ON document_subversions TO vault_app;

CREATE TABLE document_subversion_reviewers (
  subversion_reviewer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  subversion_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, subversion_reviewer_id),
  UNIQUE (tenant_id, subversion_id, reviewer_user_id),
  CONSTRAINT document_subversion_reviewers_status_timestamp_check CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT fk_document_subversion_reviewers_subversion
    FOREIGN KEY (tenant_id, subversion_id)
    REFERENCES document_subversions (tenant_id, subversion_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversion_reviewers_user
    FOREIGN KEY (tenant_id, reviewer_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversion_reviewers_assigned_by
    FOREIGN KEY (tenant_id, assigned_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_subversion_reviewers_tenant_user
  ON document_subversion_reviewers (tenant_id, reviewer_user_id, status, created_at DESC);

ALTER TABLE document_subversion_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_subversion_reviewers FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_subversion_reviewers_tenant ON document_subversion_reviewers
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_subversion_reviewers TO vault_app;
GRANT UPDATE (status, revoked_at) ON document_subversion_reviewers TO vault_app;

CREATE TABLE document_subversion_review_decisions (
  subversion_review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  subversion_id uuid NOT NULL,
  subversion_reviewer_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  last_audit_event_id uuid,
  UNIQUE (tenant_id, subversion_review_id),
  UNIQUE (tenant_id, subversion_id, reviewer_user_id),
  CONSTRAINT fk_document_subversion_review_decisions_subversion
    FOREIGN KEY (tenant_id, subversion_id)
    REFERENCES document_subversions (tenant_id, subversion_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversion_review_decisions_reviewer
    FOREIGN KEY (tenant_id, subversion_reviewer_id)
    REFERENCES document_subversion_reviewers (tenant_id, subversion_reviewer_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_subversion_review_decisions_user
    FOREIGN KEY (tenant_id, reviewer_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_subversion_review_decisions_tenant_subversion
  ON document_subversion_review_decisions (tenant_id, subversion_id, decided_at DESC);

ALTER TABLE document_subversion_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_subversion_review_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_subversion_review_decisions_tenant ON document_subversion_review_decisions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_subversion_review_decisions TO vault_app;
GRANT UPDATE (decision, decided_at, subversion_reviewer_id, last_audit_event_id) ON document_subversion_review_decisions TO vault_app;

ALTER TABLE document_versions
  ADD COLUMN promoted_from_subversion_id uuid,
  ADD COLUMN published_by uuid,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN publish_reason_code text CHECK (
    publish_reason_code IS NULL OR publish_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  ADD CONSTRAINT fk_document_versions_promoted_from_subversion
    FOREIGN KEY (tenant_id, promoted_from_subversion_id)
    REFERENCES document_subversions (tenant_id, subversion_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_document_versions_published_by
    FOREIGN KEY (tenant_id, published_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT;

COMMENT ON TABLE document_edit_sessions IS
  'Tenant-scoped Vault-native document editing sessions. Stores lock hashes, bounded reason codes, timestamps, and audit refs only; no file body, document text, raw token, Office item id, or mailbox value.';
COMMENT ON COLUMN document_edit_sessions.lock_token_hash IS
  'Hash of the active edit lock token. Raw lock tokens must never be stored.';
COMMENT ON COLUMN document_edit_sessions.checkout_reason_code IS
  'Bounded reason code only. Do not store free-text legal advice, document body, snippets, prompts, or client confidences.';
COMMENT ON TABLE document_subversions IS
  'Internal document edit saves such as v3.1 or v3.2. Rows are not official document_versions and must not be indexed, AI-prepared, or records-canonical until promoted.';
COMMENT ON COLUMN document_subversions.visibility_scope IS
  'Internal subversion visibility scope. Service permissions must still enforce matter membership, ethical walls, and fail-closed checks before access.';
COMMENT ON COLUMN document_subversions.client_save_id IS
  'Bounded client save token used to make retrying the same internal save idempotent within one edit session. It must not contain document text, comments, mailbox data, or raw external identifiers.';
COMMENT ON TABLE document_subversion_reviewers IS
  'Explicit reviewer ACL for internal subversions. Rows store user references only; no comments, document text, or review notes.';
COMMENT ON TABLE document_subversion_review_decisions IS
  'Structured reviewer decisions for internal subversions. Stores decision codes and user references only; no comments, document text, or review notes.';
COMMENT ON COLUMN document_versions.promoted_from_subversion_id IS
  'When set, this official version was published from an internal document_subversions row.';
COMMENT ON COLUMN document_versions.publish_reason_code IS
  'Bounded publish reason code only. Free-text publication notes are intentionally excluded from the schema.';

-- Down Migration

ALTER TABLE document_versions
  DROP CONSTRAINT IF EXISTS fk_document_versions_published_by,
  DROP CONSTRAINT IF EXISTS fk_document_versions_promoted_from_subversion;

ALTER TABLE document_versions
  DROP COLUMN IF EXISTS publish_reason_code,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS published_by,
  DROP COLUMN IF EXISTS promoted_from_subversion_id;

DROP TABLE IF EXISTS document_subversion_review_decisions;
DROP TABLE IF EXISTS document_subversion_reviewers;
DROP TABLE IF EXISTS document_subversions;
DROP TABLE IF EXISTS document_edit_sessions;

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_source_system_check,
  ADD CONSTRAINT file_objects_source_system_check CHECK (
    source_system IN ('upload', 'email_ingest', 'migration', 'preview_derived', 'document_edit')
  );

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
      'ACCOUNT_LEDGER_ID_ASSIGNED',
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
      'DOCUMENT_CHECKED_OUT',
      'DOCUMENT_SUBVERSION_SAVED',
      'DOCUMENT_CHECKIN_CANCELLED',
      'DOCUMENT_CHECKED_IN',
      'DOCUMENT_VERSION_PROMOTED',
      'DOCUMENT_EDIT_CONFLICT',
      'DOCUMENT_LOCK_EXPIRED',
      'DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED',
      'DOCUMENT_SUBVERSION_REVIEWER_REVOKED',
      'DOCUMENT_SUBVERSION_REVIEW_SUBMITTED',
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
      'ENTERPRISE_DMS_CONFIGURATION_CHANGED',
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
      'OUTLOOK_SEND_POLICY_EVALUATED',
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
