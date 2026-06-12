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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE litigation_evidence_items (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid,
  version_id uuid,
  evidence_code text NOT NULL CHECK (evidence_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  evidence_type text NOT NULL DEFAULT 'document' CHECK (
    evidence_type IN ('document', 'email', 'testimony', 'exhibit', 'expert', 'other')
  ),
  exhibit_label text CHECK (
    exhibit_label IS NULL
    OR (
      char_length(exhibit_label) BETWEEN 1 AND 200
      AND exhibit_label !~* '(password|secret|token)'
    )
  ),
  custody_status text NOT NULL DEFAULT 'collected' CHECK (
    custody_status IN ('collected', 'reviewed', 'challenged', 'excluded')
  ),
  admitted_status text NOT NULL DEFAULT 'unknown' CHECK (
    admitted_status IN ('unknown', 'offered', 'admitted', 'excluded', 'reserved')
  ),
  source_hash text CHECK (source_hash IS NULL OR source_hash ~* '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, evidence_id),
  UNIQUE (tenant_id, matter_id, evidence_code),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  CONSTRAINT fk_litigation_evidence_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_evidence_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_evidence_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_evidence_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_evidence_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_evidence_tenant_matter
  ON litigation_evidence_items (tenant_id, matter_id, custody_status, evidence_code);
CREATE INDEX idx_litigation_evidence_tenant_document
  ON litigation_evidence_items (tenant_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE litigation_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_evidence_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_evidence_tenant ON litigation_evidence_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_evidence_items TO vault_app;
GRANT UPDATE (
  document_id,
  version_id,
  exhibit_label,
  custody_status,
  admitted_status,
  source_hash,
  updated_by,
  updated_at
) ON litigation_evidence_items TO vault_app;

CREATE TABLE litigation_facts (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  evidence_id uuid,
  fact_code text NOT NULL CHECK (fact_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  fact_summary text NOT NULL CHECK (
    char_length(fact_summary) BETWEEN 1 AND 2000
    AND fact_summary !~* '(password|secret|token)'
  ),
  fact_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'verified', 'disputed', 'withdrawn')
  ),
  materiality text NOT NULL DEFAULT 'medium' CHECK (
    materiality IN ('low', 'medium', 'high', 'critical')
  ),
  citation_refs text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(citation_refs) <= 20
    AND array_to_string(citation_refs, '|') !~* '(body|content|snippet|raw|password|secret|token|title)'
  ),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fact_id),
  UNIQUE (tenant_id, matter_id, fact_code),
  CONSTRAINT fk_litigation_facts_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_facts_evidence
    FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES litigation_evidence_items (tenant_id, evidence_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_facts_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_facts_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_facts_tenant_matter
  ON litigation_facts (tenant_id, matter_id, status, fact_date NULLS LAST, fact_code);
CREATE INDEX idx_litigation_facts_tenant_evidence
  ON litigation_facts (tenant_id, evidence_id)
  WHERE evidence_id IS NOT NULL;

ALTER TABLE litigation_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_facts FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_facts_tenant ON litigation_facts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_facts TO vault_app;
GRANT UPDATE (
  evidence_id,
  fact_summary,
  fact_date,
  status,
  materiality,
  citation_refs,
  updated_by,
  updated_at
) ON litigation_facts TO vault_app;

CREATE TABLE litigation_issue_nodes (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  parent_issue_id uuid,
  issue_code text NOT NULL CHECK (issue_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  label text NOT NULL CHECK (
    char_length(label) BETWEEN 1 AND 200
    AND label !~* '(password|secret|token)'
  ),
  issue_type text NOT NULL DEFAULT 'argument' CHECK (
    issue_type IN ('claim', 'defense', 'element', 'argument', 'risk')
  ),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'developing', 'supported', 'weak', 'closed')
  ),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issue_id),
  UNIQUE (tenant_id, matter_id, issue_code),
  CONSTRAINT fk_litigation_issue_nodes_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_issue_nodes_parent
    FOREIGN KEY (tenant_id, parent_issue_id)
    REFERENCES litigation_issue_nodes (tenant_id, issue_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_issue_nodes_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_issue_nodes_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_issue_nodes_tenant_matter
  ON litigation_issue_nodes (tenant_id, matter_id, status, position, issue_code);
CREATE INDEX idx_litigation_issue_nodes_parent
  ON litigation_issue_nodes (tenant_id, parent_issue_id)
  WHERE parent_issue_id IS NOT NULL;

ALTER TABLE litigation_issue_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_issue_nodes FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_issue_nodes_tenant ON litigation_issue_nodes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_issue_nodes TO vault_app;
GRANT UPDATE (
  parent_issue_id,
  label,
  issue_type,
  status,
  position,
  updated_by,
  updated_at
) ON litigation_issue_nodes TO vault_app;

CREATE TABLE litigation_pleadings (
  pleading_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid,
  version_id uuid,
  pleading_code text NOT NULL CHECK (pleading_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  pleading_type text NOT NULL DEFAULT 'brief' CHECK (
    pleading_type IN ('complaint', 'answer', 'motion', 'brief', 'declaration', 'exhibit_list', 'other')
  ),
  filing_status text NOT NULL DEFAULT 'internal_draft' CHECK (
    filing_status IN (
      'internal_draft',
      'review_ready',
      'approved_internal',
      'filed_recorded',
      'served_recorded',
      'withdrawn'
    )
  ),
  internal_deadline date,
  citation_refs text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(citation_refs) <= 20
    AND array_to_string(citation_refs, '|') !~* '(body|content|snippet|raw|password|secret|token|title)'
  ),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pleading_id),
  UNIQUE (tenant_id, matter_id, pleading_code),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  CONSTRAINT fk_litigation_pleadings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_pleadings_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_pleadings_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_pleadings_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_pleadings_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_pleadings_tenant_matter
  ON litigation_pleadings (tenant_id, matter_id, filing_status, internal_deadline NULLS LAST, pleading_code);
CREATE INDEX idx_litigation_pleadings_tenant_document
  ON litigation_pleadings (tenant_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE litigation_pleadings ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_pleadings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_pleadings_tenant ON litigation_pleadings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_pleadings TO vault_app;
GRANT UPDATE (
  document_id,
  version_id,
  pleading_type,
  filing_status,
  internal_deadline,
  citation_refs,
  updated_by,
  updated_at
) ON litigation_pleadings TO vault_app;

COMMENT ON TABLE litigation_pleadings IS
  'R10 internal pleading management only. E-filing submission, external delivery, secure links, external portal, and VDR behavior remain R11+ only.';

-- Down Migration

DROP TABLE IF EXISTS litigation_pleadings;
DROP TABLE IF EXISTS litigation_issue_nodes;
DROP TABLE IF EXISTS litigation_facts;
DROP TABLE IF EXISTS litigation_evidence_items;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R10 litigation audit rows have been
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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
