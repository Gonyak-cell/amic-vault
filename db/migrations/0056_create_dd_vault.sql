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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE dd_rfis (
  rfi_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  rfi_code text NOT NULL CHECK (rfi_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  category text NOT NULL DEFAULT 'general' CHECK (
    category IN ('corporate', 'finance', 'tax', 'employment', 'ip', 'litigation', 'compliance', 'general')
  ),
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 240
    AND title !~* '(password|secret|token)'
  ),
  description text CHECK (
    description IS NULL
    OR (
      char_length(description) <= 2000
      AND description !~* '(password|secret|token)'
    )
  ),
  status text NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'submitted', 'reviewing', 'supplement_requested', 'complete', 'reported')
  ),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  owner_user_id uuid,
  due_date date,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rfi_id),
  UNIQUE (tenant_id, matter_id, rfi_code),
  CONSTRAINT fk_dd_rfis_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_rfis_owner
    FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_rfis_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_rfis_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_dd_rfis_tenant_matter
  ON dd_rfis (tenant_id, matter_id, status, due_date NULLS LAST, rfi_code);

ALTER TABLE dd_rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_rfis FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dd_rfis_tenant ON dd_rfis
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dd_rfis TO vault_app;
GRANT UPDATE (
  category,
  title,
  description,
  status,
  priority,
  owner_user_id,
  due_date,
  updated_by,
  updated_at
) ON dd_rfis TO vault_app;

CREATE TABLE dd_data_room_mappings (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  rfi_id uuid,
  document_id uuid,
  version_id uuid,
  internal_label text NOT NULL CHECK (
    char_length(internal_label) BETWEEN 1 AND 160
    AND internal_label !~* '(password|secret|token)'
  ),
  section_path text NOT NULL CHECK (
    char_length(section_path) BETWEEN 1 AND 160
    AND section_path !~* '(password|secret|token)'
  ),
  mapping_status text NOT NULL DEFAULT 'missing' CHECK (
    mapping_status IN ('mapped', 'missing', 'supplement_requested')
  ),
  supplement_requested_at timestamptz,
  mapped_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mapping_id),
  CHECK (
    (mapping_status = 'mapped' AND document_id IS NOT NULL)
    OR (mapping_status <> 'mapped' AND document_id IS NULL)
  ),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  CONSTRAINT fk_dd_data_room_mappings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_data_room_mappings_rfi
    FOREIGN KEY (tenant_id, rfi_id)
    REFERENCES dd_rfis (tenant_id, rfi_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_data_room_mappings_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_data_room_mappings_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_data_room_mappings_mapped_by
    FOREIGN KEY (tenant_id, mapped_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_dd_data_room_mappings_tenant_matter
  ON dd_data_room_mappings (tenant_id, matter_id, mapping_status, created_at DESC);
CREATE INDEX idx_dd_data_room_mappings_tenant_document
  ON dd_data_room_mappings (tenant_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE dd_data_room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_data_room_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dd_data_room_mappings_tenant ON dd_data_room_mappings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dd_data_room_mappings TO vault_app;
GRANT UPDATE (
  rfi_id,
  document_id,
  version_id,
  internal_label,
  section_path,
  mapping_status,
  supplement_requested_at,
  mapped_by,
  updated_at
) ON dd_data_room_mappings TO vault_app;

CREATE TABLE dd_issues (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  rfi_id uuid,
  document_id uuid,
  issue_code text NOT NULL CHECK (issue_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 240
    AND title !~* '(password|secret|token)'
  ),
  severity text NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'triaged', 'mitigated', 'accepted', 'closed')
  ),
  citation_refs text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(citation_refs) <= 20
    AND array_to_string(citation_refs, '|') !~* '(body|content|snippet|raw|password|secret|token)'
  ),
  report_inclusion boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issue_id),
  UNIQUE (tenant_id, matter_id, issue_code),
  CONSTRAINT fk_dd_issues_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_issues_rfi
    FOREIGN KEY (tenant_id, rfi_id)
    REFERENCES dd_rfis (tenant_id, rfi_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_issues_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_issues_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_issues_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_dd_issues_tenant_matter
  ON dd_issues (tenant_id, matter_id, status, severity, created_at DESC);
CREATE INDEX idx_dd_issues_tenant_document
  ON dd_issues (tenant_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE dd_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_issues FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dd_issues_tenant ON dd_issues
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dd_issues TO vault_app;
GRANT UPDATE (
  rfi_id,
  document_id,
  title,
  severity,
  status,
  citation_refs,
  report_inclusion,
  updated_by,
  updated_at
) ON dd_issues TO vault_app;

CREATE TABLE dd_risks (
  risk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  issue_id uuid,
  risk_code text NOT NULL CHECK (risk_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  category text NOT NULL DEFAULT 'legal' CHECK (
    category IN ('legal', 'financial', 'operational', 'compliance', 'tax', 'other')
  ),
  severity text NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),
  likelihood text NOT NULL DEFAULT 'medium' CHECK (likelihood IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'monitoring', 'mitigated', 'accepted', 'closed')
  ),
  mitigation_summary text CHECK (
    mitigation_summary IS NULL
    OR (
      char_length(mitigation_summary) <= 1000
      AND mitigation_summary !~* '(password|secret|token)'
    )
  ),
  citation_refs text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(citation_refs) <= 20
    AND array_to_string(citation_refs, '|') !~* '(body|content|snippet|raw|password|secret|token)'
  ),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, risk_id),
  UNIQUE (tenant_id, matter_id, risk_code),
  CONSTRAINT fk_dd_risks_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_risks_issue
    FOREIGN KEY (tenant_id, issue_id)
    REFERENCES dd_issues (tenant_id, issue_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_risks_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dd_risks_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_dd_risks_tenant_matter
  ON dd_risks (tenant_id, matter_id, status, severity, created_at DESC);
CREATE INDEX idx_dd_risks_tenant_issue
  ON dd_risks (tenant_id, issue_id)
  WHERE issue_id IS NOT NULL;

ALTER TABLE dd_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_risks FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dd_risks_tenant ON dd_risks
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dd_risks TO vault_app;
GRANT UPDATE (
  issue_id,
  category,
  severity,
  likelihood,
  status,
  mitigation_summary,
  citation_refs,
  updated_by,
  updated_at
) ON dd_risks TO vault_app;

COMMENT ON TABLE dd_data_room_mappings IS
  'R9 internal-only DD data room mapping. This table must not issue secure links, expose external users, or implement VDR sharing before R11.';

-- Down Migration

DROP TABLE IF EXISTS dd_risks;
DROP TABLE IF EXISTS dd_issues;
DROP TABLE IF EXISTS dd_data_room_mappings;
DROP TABLE IF EXISTS dd_rfis;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R9 DD audit rows have been recorded,
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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
