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
      'SSO_PROVIDER_CHANGED',
      'SSO_METADATA_VIEWED',
      'BYOK_KEY_REFERENCE_CHANGED',
      'SIEM_EXPORT_RECORDED',
      'BACKUP_SNAPSHOT_RECORDED',
      'COMPLIANCE_EVIDENCE_RECORDED',
      'ENTERPRISE_READINESS_VIEWED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE enterprise_sso_providers (
  provider_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  protocol text NOT NULL DEFAULT 'saml2' CHECK (protocol = 'saml2'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disabled')),
  idp_entity_id text NOT NULL CHECK (idp_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  sso_url_hash char(64) NOT NULL CHECK (sso_url_hash ~ '^[0-9a-f]{64}$'),
  certificate_fingerprint text NOT NULL CHECK (certificate_fingerprint ~ '^[A-F0-9:]{47,95}$'),
  metadata_hash char(64) NOT NULL CHECK (metadata_hash ~ '^[0-9a-f]{64}$'),
  default_role text NOT NULL CHECK (
    default_role IN (
      'firm_admin',
      'security_admin',
      'matter_owner',
      'matter_member',
      'limited_reviewer',
      'knowledge_manager'
    )
  ),
  enforcement_mode text NOT NULL DEFAULT 'optional'
    CHECK (enforcement_mode IN ('optional', 'password_disabled')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id),
  UNIQUE (tenant_id, provider_key),
  CONSTRAINT fk_enterprise_sso_providers_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_sso_providers_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_sso_providers_tenant_status
  ON enterprise_sso_providers (tenant_id, status, provider_key);

ALTER TABLE enterprise_sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_sso_providers FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_sso_providers_tenant ON enterprise_sso_providers
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_sso_providers TO vault_app;
GRANT UPDATE (
  display_name, status, sso_url_hash, certificate_fingerprint, metadata_hash,
  default_role, enforcement_mode, updated_by, updated_at
) ON enterprise_sso_providers TO vault_app;

CREATE TABLE enterprise_key_references (
  key_reference_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  key_label text NOT NULL CHECK (
    char_length(key_label) BETWEEN 1 AND 200
    AND key_label !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  key_provider text NOT NULL CHECK (key_provider IN ('local_kms', 'cloud_kms', 'hsm')),
  key_ref_hash char(64) NOT NULL CHECK (key_ref_hash ~ '^[0-9a-f]{64}$'),
  key_fingerprint char(64) NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rotating', 'disabled')),
  rotation_due_at timestamptz,
  last_verified_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key_reference_id),
  UNIQUE (tenant_id, key_ref_hash),
  CONSTRAINT fk_enterprise_key_references_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_key_references_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE enterprise_key_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_key_references FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_key_references_tenant ON enterprise_key_references
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_key_references TO vault_app;
GRANT UPDATE (status, rotation_due_at, last_verified_at, updated_by, updated_at)
  ON enterprise_key_references TO vault_app;

CREATE TABLE enterprise_siem_exports (
  siem_export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  sink_type text NOT NULL CHECK (sink_type IN ('syslog', 'webhook', 's3')),
  endpoint_hash char(64) NOT NULL CHECK (endpoint_hash ~ '^[0-9a-f]{64}$'),
  seq_start bigint NOT NULL CHECK (seq_start >= 0),
  seq_end bigint NOT NULL CHECK (seq_end >= seq_start),
  event_count integer NOT NULL CHECK (event_count >= 0),
  manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'recorded' CHECK (status = 'recorded'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, siem_export_id),
  CONSTRAINT fk_enterprise_siem_exports_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE enterprise_siem_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_siem_exports FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_siem_exports_tenant ON enterprise_siem_exports
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_siem_exports TO vault_app;

CREATE TABLE enterprise_backup_snapshots (
  backup_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('tenant', 'audit', 'configuration')),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'verified', 'failed')),
  manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  row_counts_hash char(64) NOT NULL CHECK (row_counts_hash ~ '^[0-9a-f]{64}$'),
  row_counts_json jsonb NOT NULL CHECK (jsonb_typeof(row_counts_json) = 'object'),
  table_count integer NOT NULL CHECK (table_count >= 0),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, backup_snapshot_id),
  CONSTRAINT fk_enterprise_backup_snapshots_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE enterprise_backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_backup_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_backup_snapshots_tenant ON enterprise_backup_snapshots
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_backup_snapshots TO vault_app;

CREATE TABLE enterprise_compliance_evidence (
  compliance_evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  framework text NOT NULL CHECK (framework IN ('soc2', 'iso27001')),
  control_id text NOT NULL CHECK (control_id ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  status text NOT NULL CHECK (status IN ('ready', 'gap', 'accepted')),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  owner_user_id uuid,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, compliance_evidence_id),
  UNIQUE (tenant_id, framework, control_id, evidence_ref),
  CONSTRAINT fk_enterprise_compliance_owner
    FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_compliance_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_compliance_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE enterprise_compliance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_compliance_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_compliance_evidence_tenant ON enterprise_compliance_evidence
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_compliance_evidence TO vault_app;
GRANT UPDATE (status, evidence_hash, owner_user_id, updated_by, updated_at)
  ON enterprise_compliance_evidence TO vault_app;

COMMENT ON TABLE enterprise_sso_providers IS
  'R13 SSO/SAML provider references. Raw SAML metadata, URLs, assertions, and certificates are not stored; only hashes and fingerprints.';
COMMENT ON TABLE enterprise_key_references IS
  'R13 BYOK references. Raw key material and secret handles are never stored; only hashes and fingerprints.';
COMMENT ON TABLE enterprise_siem_exports IS
  'R13 SIEM export batch manifests. No outbound delivery secret or endpoint URL is stored.';
COMMENT ON TABLE enterprise_backup_snapshots IS
  'R13 backup/DR snapshot evidence with row-count manifest hashes only, not data exports.';
COMMENT ON TABLE enterprise_compliance_evidence IS
  'R13 compliance readiness evidence references and hashes only, no evidence body.';

-- Down Migration

DROP TABLE IF EXISTS enterprise_compliance_evidence;
DROP TABLE IF EXISTS enterprise_backup_snapshots;
DROP TABLE IF EXISTS enterprise_siem_exports;
DROP TABLE IF EXISTS enterprise_key_references;
DROP TABLE IF EXISTS enterprise_sso_providers;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R13 audit rows exist, rollback cannot
-- safely remove R13 actions from durable history; the down path restores the
-- pre-R13 allow-list for clean roundtrip verification.
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
