-- Up Migration

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ai_prep_artifacts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pending%'
      AND pg_get_constraintdef(oid) LIKE '%completed%'
      AND pg_get_constraintdef(oid) LIKE '%blocked%'
      AND pg_get_constraintdef(oid) LIKE '%failed%'
      AND pg_get_constraintdef(oid) LIKE '%stale%'
  LOOP
    EXECUTE format('ALTER TABLE ai_prep_artifacts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_status_check CHECK (
    status IN ('pending', 'completed', 'blocked', 'failed', 'rejected', 'stale')
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ai_prep_artifacts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%failure_reason_code%'
      AND pg_get_constraintdef(oid) LIKE '%blocked%'
      AND pg_get_constraintdef(oid) LIKE '%failed%'
  LOOP
    EXECUTE format('ALTER TABLE ai_prep_artifacts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_terminal_reason_check CHECK (
    (status IN ('blocked', 'failed', 'rejected') AND failure_reason_code IS NOT NULL)
    OR status NOT IN ('blocked', 'failed', 'rejected')
  );

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_rejected_hash_check CHECK (
    (status = 'rejected' AND prompt_hash IS NOT NULL AND response_hash IS NOT NULL)
    OR status <> 'rejected'
  );

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_rejected_payload_file_org_check CHECK (
    status <> 'rejected'
    OR ai_prep_completed_payload_file_organization_allowed(payload_json, artifact_kind)
  );

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After AI_PREP_REJECTED rows have been recorded,
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

COMMENT ON CONSTRAINT ai_prep_artifacts_status_check ON ai_prep_artifacts IS
  'AI prep rejected is a first-class terminal state for discarded invalid model output.';

COMMENT ON CONSTRAINT ai_prep_artifacts_terminal_reason_check ON ai_prep_artifacts IS
  'Blocked, failed, and rejected AI prep artifacts must carry bounded reason codes.';

COMMENT ON CONSTRAINT ai_prep_artifacts_rejected_payload_file_org_check ON ai_prep_artifacts IS
  'Rejected AI prep payloads remain bounded file-organization records for ops only; raw model output is not persisted.';

-- Down Migration

UPDATE ai_prep_artifacts
SET status = 'failed',
  failure_reason_code = COALESCE(failure_reason_code, 'AI_PREP_REJECTED_ROLLBACK'),
  updated_at = now()
WHERE status = 'rejected';

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_rejected_hash_check;

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_rejected_payload_file_org_check;

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_terminal_reason_check;

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_status_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_status_check CHECK (
    status IN ('pending', 'completed', 'blocked', 'failed', 'stale')
  );

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_terminal_reason_check CHECK (
    (status IN ('blocked', 'failed') AND failure_reason_code IS NOT NULL)
    OR status NOT IN ('blocked', 'failed')
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
