-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. Outlook actions are added before live Graph,
-- Smart Alerts, or tenant deployment is enabled so denied/default-closed
-- integration attempts can still be audited with reference-only metadata.
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

CREATE TABLE outlook_filing_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  outlook_item_id_hash char(64) NOT NULL CHECK (outlook_item_id_hash ~ '^[0-9a-f]{64}$'),
  internet_message_id_hash char(64) CHECK (
    internet_message_id_hash IS NULL OR internet_message_id_hash ~ '^[0-9a-f]{64}$'
  ),
  conversation_id_hash char(64) CHECK (
    conversation_id_hash IS NULL OR conversation_id_hash ~ '^[0-9a-f]{64}$'
  ),
  canonical_message_sha256 char(64) NOT NULL CHECK (canonical_message_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_set_hash char(64) NOT NULL CHECK (attachment_set_hash ~ '^[0-9a-f]{64}$'),
  has_external_participants boolean NOT NULL,
  participant_domain_hash_count integer NOT NULL DEFAULT 0 CHECK (
    participant_domain_hash_count >= 0
    AND participant_domain_hash_count <= 50
  ),
  sent_at timestamptz,
  received_at timestamptz,
  source_client text NOT NULL CHECK (source_client = 'outlook-web-addin'),
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  selected_attachment_count integer NOT NULL DEFAULT 0 CHECK (selected_attachment_count >= 0),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'denied', 'failed', 'cancelled')
  ),
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
  email_record_id uuid,
  filed_attachment_count integer NOT NULL DEFAULT 0 CHECK (filed_attachment_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id),
  UNIQUE (tenant_id, user_id, idempotency_key_hash),
  UNIQUE (tenant_id, user_id, client_request_id_hash),
  UNIQUE (
    tenant_id,
    user_id,
    mailbox_fingerprint_hash,
    matter_id,
    canonical_message_sha256,
    attachment_set_hash
  ),
  CONSTRAINT fk_outlook_filing_requests_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_filing_requests_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_filing_requests_email
    FOREIGN KEY (tenant_id, email_record_id)
    REFERENCES email_messages (tenant_id, email_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_filing_requests_tenant_matter
  ON outlook_filing_requests (tenant_id, matter_id, created_at DESC, request_id);

CREATE INDEX idx_outlook_filing_requests_tenant_user_status
  ON outlook_filing_requests (tenant_id, user_id, status, created_at DESC, request_id);

ALTER TABLE outlook_filing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_filing_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_filing_requests_tenant ON outlook_filing_requests
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_filing_requests TO vault_app;

COMMENT ON TABLE outlook_filing_requests IS
  'Tenant-scoped Outlook add-in filing request records. Stores hashes, counts, and Vault refs only; raw mailbox addresses, Graph ids, subject, body, headers, participant addresses, filenames, and attachment bytes are forbidden.';

COMMENT ON COLUMN outlook_filing_requests.mailbox_fingerprint_hash IS
  'Server-accepted mailbox fingerprint hash. Raw mailbox address or account id must never be stored.';

COMMENT ON COLUMN outlook_filing_requests.outlook_item_id_hash IS
  'Hash of the client-visible Outlook item reference. Raw Office/Graph item id must never be stored.';

CREATE TABLE outlook_filing_request_attachments (
  attachment_ref_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  attachment_id_hash char(64) NOT NULL CHECK (attachment_id_hash ~ '^[0-9a-f]{64}$'),
  content_id_hash char(64) CHECK (
    content_id_hash IS NULL OR content_id_hash ~ '^[0-9a-f]{64}$'
  ),
  ordinal integer NOT NULL CHECK (ordinal >= 0 AND ordinal <= 500),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 char(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text CHECK (mime_type IS NULL OR length(mime_type) BETWEEN 1 AND 255),
  selected_for_filing boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attachment_ref_id),
  UNIQUE (tenant_id, request_id, ordinal),
  CONSTRAINT fk_outlook_filing_request_attachments_request
    FOREIGN KEY (tenant_id, request_id)
    REFERENCES outlook_filing_requests (tenant_id, request_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_outlook_filing_request_attachments_request
  ON outlook_filing_request_attachments (tenant_id, request_id, ordinal);

ALTER TABLE outlook_filing_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_filing_request_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_filing_request_attachments_tenant
  ON outlook_filing_request_attachments
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON outlook_filing_request_attachments TO vault_app;

COMMENT ON TABLE outlook_filing_request_attachments IS
  'Reference-only Outlook attachment selections for filing requests. Stores hashes and bounded metadata only; filenames and bytes are forbidden.';

-- Down Migration

DROP TABLE IF EXISTS outlook_filing_request_attachments;
DROP TABLE IF EXISTS outlook_filing_requests;

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
      'EMAIL_FILED'
    )
  );
