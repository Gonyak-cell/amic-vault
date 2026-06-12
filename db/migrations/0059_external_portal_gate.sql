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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

ALTER TABLE external_secure_links
  ADD COLUMN dlp_warning_status text NOT NULL DEFAULT 'not_required'
    CHECK (dlp_warning_status IN ('not_required', 'required', 'accepted')),
  ADD COLUMN dlp_result_hash text CHECK (dlp_result_hash IS NULL OR dlp_result_hash ~* '^[a-f0-9]{64}$'),
  ADD COLUMN dlp_finding_count integer NOT NULL DEFAULT 0 CHECK (dlp_finding_count >= 0),
  ADD COLUMN dlp_override_reason_code text CHECK (
    dlp_override_reason_code IS NULL OR dlp_override_reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  ),
  ADD CONSTRAINT external_secure_links_dlp_warning_consistency CHECK (
    (
      dlp_warning_status = 'not_required'
      AND dlp_finding_count = 0
      AND dlp_override_reason_code IS NULL
    )
    OR (
      dlp_warning_status = 'accepted'
      AND dlp_finding_count > 0
      AND dlp_result_hash IS NOT NULL
      AND dlp_override_reason_code IS NOT NULL
    )
  );

CREATE INDEX idx_external_secure_links_dlp_warning
  ON external_secure_links (tenant_id, dlp_warning_status, dlp_finding_count);

CREATE TABLE external_qa_messages (
  qa_message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  link_id uuid NOT NULL,
  external_user_id uuid NOT NULL,
  parent_message_id uuid,
  direction text NOT NULL CHECK (direction IN ('external_question', 'internal_answer')),
  message_text text NOT NULL CHECK (
    char_length(message_text) BETWEEN 1 AND 2000
    AND message_text !~* '(password|secret|token|api[_ -]?key)'
  ),
  message_hash text NOT NULL CHECK (message_hash ~* '^[a-f0-9]{64}$'),
  actor_ref_hash text CHECK (actor_ref_hash IS NULL OR actor_ref_hash ~* '^[a-f0-9]{64}$'),
  created_by_internal_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, qa_message_id),
  CONSTRAINT fk_external_qa_messages_link
    FOREIGN KEY (tenant_id, link_id)
    REFERENCES external_secure_links (tenant_id, link_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_qa_messages_member
    FOREIGN KEY (tenant_id, workspace_id, external_user_id)
    REFERENCES external_workspace_members (tenant_id, workspace_id, external_user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_qa_messages_parent
    FOREIGN KEY (tenant_id, parent_message_id)
    REFERENCES external_qa_messages (tenant_id, qa_message_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_qa_messages_internal_user
    FOREIGN KEY (tenant_id, created_by_internal_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (direction = 'external_question' AND parent_message_id IS NULL AND created_by_internal_user_id IS NULL)
    OR (direction = 'internal_answer' AND parent_message_id IS NOT NULL AND created_by_internal_user_id IS NOT NULL)
  )
);

CREATE INDEX idx_external_qa_messages_workspace
  ON external_qa_messages (tenant_id, workspace_id, created_at, qa_message_id);

CREATE INDEX idx_external_qa_messages_link
  ON external_qa_messages (tenant_id, link_id, created_at, qa_message_id);

ALTER TABLE external_qa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_qa_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_qa_messages_tenant ON external_qa_messages
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_qa_messages TO vault_app;

COMMENT ON COLUMN external_secure_links.dlp_warning_status IS
  'R11 external DLP warning state. Sensitive matched values must never be stored here.';

COMMENT ON TABLE external_qa_messages IS
  'R11 portal Q&A messages. Audit metadata stores qa_message_id/hash refs only and never copies message_text.';

-- Down Migration

DROP TABLE IF EXISTS external_qa_messages;

DROP INDEX IF EXISTS idx_external_secure_links_dlp_warning;

ALTER TABLE external_secure_links
  DROP CONSTRAINT IF EXISTS external_secure_links_dlp_warning_consistency,
  DROP COLUMN IF EXISTS dlp_override_reason_code,
  DROP COLUMN IF EXISTS dlp_finding_count,
  DROP COLUMN IF EXISTS dlp_result_hash,
  DROP COLUMN IF EXISTS dlp_warning_status;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R11 portal rows have been recorded,
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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
