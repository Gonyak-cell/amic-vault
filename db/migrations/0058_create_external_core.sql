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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

ALTER TABLE sharing_policy_definitions
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_status_check,
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_enforcement_mode_check,
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_control_ref_check;

ALTER TABLE sharing_policy_definitions
  ALTER COLUMN status SET DEFAULT 'enabled_r11',
  ALTER COLUMN enforcement_mode SET DEFAULT 'controlled_allow',
  ALTER COLUMN control_ref SET DEFAULT 'R11_EXTERNAL_SHARING_CRITICAL_GATE';

ALTER TABLE sharing_policy_definitions
  ADD CONSTRAINT sharing_policy_definitions_status_check
    CHECK (status IN ('disabled_until_r11', 'enabled_r11')),
  ADD CONSTRAINT sharing_policy_definitions_enforcement_mode_check
    CHECK (enforcement_mode IN ('deny_all', 'controlled_allow')),
  ADD CONSTRAINT sharing_policy_definitions_control_ref_check
    CHECK (control_ref IN ('R11_FUTURE_CONTROL', 'R11_EXTERNAL_SHARING_CRITICAL_GATE'));

UPDATE sharing_policy_definitions
SET status = 'enabled_r11',
    enforcement_mode = 'controlled_allow',
    control_ref = 'R11_EXTERNAL_SHARING_CRITICAL_GATE',
    updated_at = now()
WHERE policy_key IN ('external_sharing', 'secure_link', 'external_user_access');

INSERT INTO sharing_policy_definitions (tenant_id, policy_key, status, enforcement_mode, control_ref)
SELECT t.tenant_id, p.policy_key, 'enabled_r11', 'controlled_allow', 'R11_EXTERNAL_SHARING_CRITICAL_GATE'
FROM tenants t
CROSS JOIN (
  VALUES ('external_sharing'), ('secure_link'), ('external_user_access')
) AS p(policy_key)
ON CONFLICT (tenant_id, policy_key) DO NOTHING;

CREATE TABLE external_workspaces (
  workspace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  workspace_code text NOT NULL CHECK (workspace_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  display_ref text NOT NULL CHECK (
    char_length(display_ref) BETWEEN 1 AND 160
    AND display_ref ~ '^[A-Za-z0-9 ._-]+$'
    AND display_ref !~* '(@|password|secret|token|body|snippet|content)'
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id),
  UNIQUE (tenant_id, matter_id, workspace_code),
  CONSTRAINT fk_external_workspaces_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_workspaces_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_workspaces_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_external_workspaces_tenant_matter
  ON external_workspaces (tenant_id, matter_id, status, expires_at);

ALTER TABLE external_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_workspaces_tenant ON external_workspaces
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_workspaces TO vault_app;
GRANT UPDATE (status, expires_at, updated_by, updated_at) ON external_workspaces TO vault_app;

CREATE TABLE external_users (
  external_user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email_hash text NOT NULL CHECK (email_hash ~* '^[a-f0-9]{64}$'),
  display_ref text CHECK (
    display_ref IS NULL
    OR (
      char_length(display_ref) BETWEEN 1 AND 160
      AND display_ref ~ '^[A-Za-z0-9 ._-]+$'
      AND display_ref !~* '(@|password|secret|token|body|snippet|content)'
    )
  ),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_user_id),
  UNIQUE (tenant_id, email_hash),
  CONSTRAINT fk_external_users_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_users_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_external_users_tenant_status
  ON external_users (tenant_id, status, created_at);

ALTER TABLE external_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_users FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_users_tenant ON external_users
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_users TO vault_app;
GRANT UPDATE (display_ref, status, updated_by, updated_at) ON external_users TO vault_app;

CREATE TABLE external_workspace_members (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  external_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, membership_id),
  UNIQUE (tenant_id, workspace_id, external_user_id),
  CONSTRAINT fk_external_workspace_members_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES external_workspaces (tenant_id, workspace_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_workspace_members_external_user
    FOREIGN KEY (tenant_id, external_user_id)
    REFERENCES external_users (tenant_id, external_user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_workspace_members_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_external_workspace_members_tenant_workspace
  ON external_workspace_members (tenant_id, workspace_id, status);

ALTER TABLE external_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_workspace_members FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_workspace_members_tenant ON external_workspace_members
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_workspace_members TO vault_app;
GRANT UPDATE (status, updated_at) ON external_workspace_members TO vault_app;

CREATE TABLE external_secure_links (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  external_user_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid,
  token_hash text NOT NULL CHECK (token_hash ~* '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  nda_required boolean NOT NULL DEFAULT true,
  watermark_required boolean NOT NULL DEFAULT true,
  access_count integer NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, link_id),
  UNIQUE (tenant_id, token_hash),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  CONSTRAINT fk_external_secure_links_member
    FOREIGN KEY (tenant_id, workspace_id, external_user_id)
    REFERENCES external_workspace_members (tenant_id, workspace_id, external_user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_secure_links_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_secure_links_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_secure_links_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_secure_links_revoked_by
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_external_secure_links_tenant_workspace
  ON external_secure_links (tenant_id, workspace_id, status, expires_at);
CREATE INDEX idx_external_secure_links_document
  ON external_secure_links (tenant_id, document_id);

ALTER TABLE external_secure_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_secure_links FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_secure_links_tenant ON external_secure_links
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_secure_links TO vault_app;
GRANT UPDATE (status, revoked_at, revoked_by, access_count, updated_at) ON external_secure_links TO vault_app;

CREATE TABLE external_nda_acceptances (
  acceptance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  link_id uuid NOT NULL,
  external_user_id uuid NOT NULL,
  nda_version text NOT NULL CHECK (nda_version ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  actor_ref_hash text CHECK (actor_ref_hash IS NULL OR actor_ref_hash ~* '^[a-f0-9]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, acceptance_id),
  UNIQUE (tenant_id, link_id, external_user_id, nda_version),
  CONSTRAINT fk_external_nda_acceptances_link
    FOREIGN KEY (tenant_id, link_id)
    REFERENCES external_secure_links (tenant_id, link_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_nda_acceptances_external_user
    FOREIGN KEY (tenant_id, external_user_id)
    REFERENCES external_users (tenant_id, external_user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_external_nda_acceptances_tenant_link
  ON external_nda_acceptances (tenant_id, link_id, accepted_at DESC);

ALTER TABLE external_nda_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_nda_acceptances FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_nda_acceptances_tenant ON external_nda_acceptances
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_nda_acceptances TO vault_app;

COMMENT ON TABLE external_secure_links IS
  'R11 controlled secure link core. Stores token_hash only; raw link tokens must never be persisted or audited.';

COMMENT ON TABLE external_nda_acceptances IS
  'R11 NDA acceptance records with hashed actor refs only. No recipient raw address or document content is stored.';

-- Down Migration

DROP TABLE IF EXISTS external_nda_acceptances;
DROP TABLE IF EXISTS external_secure_links;
DROP TABLE IF EXISTS external_workspace_members;
DROP TABLE IF EXISTS external_users;
DROP TABLE IF EXISTS external_workspaces;

UPDATE sharing_policy_definitions
SET status = 'disabled_until_r11',
    enforcement_mode = 'deny_all',
    control_ref = 'R11_FUTURE_CONTROL',
    updated_at = now()
WHERE policy_key IN ('external_sharing', 'secure_link', 'external_user_access');

ALTER TABLE sharing_policy_definitions
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_status_check,
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_enforcement_mode_check,
  DROP CONSTRAINT IF EXISTS sharing_policy_definitions_control_ref_check;

ALTER TABLE sharing_policy_definitions
  ALTER COLUMN status SET DEFAULT 'disabled_until_r11',
  ALTER COLUMN enforcement_mode SET DEFAULT 'deny_all',
  ALTER COLUMN control_ref SET DEFAULT 'R11_FUTURE_CONTROL';

ALTER TABLE sharing_policy_definitions
  ADD CONSTRAINT sharing_policy_definitions_status_check
    CHECK (status IN ('disabled_until_r11')),
  ADD CONSTRAINT sharing_policy_definitions_enforcement_mode_check
    CHECK (enforcement_mode IN ('deny_all')),
  ADD CONSTRAINT sharing_policy_definitions_control_ref_check
    CHECK (control_ref = 'R11_FUTURE_CONTROL');

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R11 external audit rows have been
-- recorded, rollback cannot safely remove these actions from the allow-list.
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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
