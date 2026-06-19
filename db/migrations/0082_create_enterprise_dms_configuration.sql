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

CREATE TABLE enterprise_dms_taxonomies (
  taxonomy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_type_code text NOT NULL CHECK (document_type_code ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  description text CHECK (
    description IS NULL OR (
      char_length(description) <= 400
      AND description !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|prompt|response|model)'
    )
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  subtypes_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(subtypes_json) = 'array'
    AND jsonb_array_length(subtypes_json) <= 20
  ),
  metadata_fields_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(metadata_fields_json) = 'array'
    AND jsonb_array_length(metadata_fields_json) <= 20
  ),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, taxonomy_id),
  UNIQUE (tenant_id, document_type_code),
  CONSTRAINT fk_enterprise_dms_taxonomies_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_taxonomies_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_dms_taxonomies_tenant_status
  ON enterprise_dms_taxonomies (tenant_id, status, document_type_code);

ALTER TABLE enterprise_dms_taxonomies ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_dms_taxonomies FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_dms_taxonomies_tenant ON enterprise_dms_taxonomies
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_dms_taxonomies TO vault_app;
GRANT UPDATE (
  display_name, description, status, subtypes_json, metadata_fields_json,
  updated_by, updated_at
) ON enterprise_dms_taxonomies TO vault_app;

CREATE TABLE enterprise_dms_search_refiners (
  refiner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9._-]{1,79}$'),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  field_type text NOT NULL CHECK (field_type IN ('text', 'date', 'user', 'matter', 'boolean', 'number', 'select')),
  source text NOT NULL CHECK (source IN ('document_profile', 'matter_profile', 'records', 'system')),
  searchable boolean NOT NULL DEFAULT true,
  refinable boolean NOT NULL DEFAULT true,
  filterable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 999),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, refiner_id),
  UNIQUE (tenant_id, field_key),
  CONSTRAINT fk_enterprise_dms_search_refiners_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_search_refiners_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_dms_search_refiners_tenant_order
  ON enterprise_dms_search_refiners (tenant_id, status, sort_order, field_key);

ALTER TABLE enterprise_dms_search_refiners ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_dms_search_refiners FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_dms_search_refiners_tenant ON enterprise_dms_search_refiners
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_dms_search_refiners TO vault_app;
GRANT UPDATE (
  display_name, field_type, source, searchable, refinable, filterable, status,
  sort_order, updated_by, updated_at
) ON enterprise_dms_search_refiners TO vault_app;

COMMENT ON TABLE enterprise_dms_taxonomies IS
  'Tenant DMS document taxonomy configuration. Stores document type/subtype and bounded metadata-field contracts only; no document body, snippets, prompts, or model responses.';
COMMENT ON TABLE enterprise_dms_search_refiners IS
  'Tenant DMS search refiner configuration. Stores field keys and bounded refiner flags only; no raw queries, document body, snippets, prompts, or model responses.';

-- Down Migration

DROP TABLE IF EXISTS enterprise_dms_search_refiners;
DROP TABLE IF EXISTS enterprise_dms_taxonomies;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After ENTERPRISE_DMS_CONFIGURATION_CHANGED rows
-- exist, rollback cannot safely remove the action from durable history; this
-- down path restores the pre-0082 allow-list for clean roundtrip verification.
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
