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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE contract_classifications (
  classification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  contract_type text NOT NULL CHECK (
    contract_type IN ('nda', 'msa', 'share_purchase', 'employment', 'lease', 'loan', 'unknown')
  ),
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  unsupported boolean NOT NULL DEFAULT false,
  classifier_version text NOT NULL CHECK (classifier_version ~ '^r8-[a-z0-9.-]{1,32}$'),
  signal_refs text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(signal_refs) <= 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, classification_id),
  UNIQUE (tenant_id, version_id),
  CONSTRAINT fk_contract_classifications_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_classifications_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_classifications_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_classifications_tenant_matter
  ON contract_classifications (tenant_id, matter_id, contract_type, updated_at DESC);

ALTER TABLE contract_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_classifications FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_classifications_tenant ON contract_classifications
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_classifications TO vault_app;
GRANT UPDATE (
  matter_id,
  document_id,
  contract_type,
  confidence,
  unsupported,
  classifier_version,
  signal_refs,
  updated_at
) ON contract_classifications TO vault_app;

CREATE TABLE contract_clauses (
  clause_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_kind text NOT NULL CHECK (clause_kind IN ('article', 'section', 'paragraph', 'definition')),
  clause_number text NOT NULL CHECK (char_length(clause_number) BETWEEN 1 AND 80),
  parent_clause_id uuid,
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  heading_hash char(64) NOT NULL CHECK (heading_hash ~ '^[0-9a-f]{64}$'),
  text_hash char(64) NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  parser_version text NOT NULL CHECK (parser_version ~ '^r8-[a-z0-9.-]{1,32}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, clause_id),
  UNIQUE (tenant_id, version_id, clause_number, start_offset),
  CONSTRAINT fk_contract_clauses_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clauses_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clauses_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clauses_parent
    FOREIGN KEY (tenant_id, parent_clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_clauses_tenant_document
  ON contract_clauses (tenant_id, document_id, stale, start_offset);

ALTER TABLE contract_clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_clauses FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_clauses_tenant ON contract_clauses
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_clauses TO vault_app;
GRANT UPDATE (
  clause_kind,
  clause_number,
  parent_clause_id,
  start_offset,
  end_offset,
  heading_hash,
  text_hash,
  parser_version,
  stale,
  updated_at
) ON contract_clauses TO vault_app;

CREATE TABLE contract_clause_chunks (
  clause_chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  clause_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  chunk_id uuid,
  chunk_ordinal integer NOT NULL CHECK (chunk_ordinal >= 0),
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  text_hash char(64) NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, clause_chunk_id),
  UNIQUE (tenant_id, clause_id, chunk_ordinal),
  CONSTRAINT fk_contract_clause_chunks_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_chunks_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_chunks_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_chunks_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_chunks_chunk
    FOREIGN KEY (tenant_id, chunk_id)
    REFERENCES document_chunks (tenant_id, chunk_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_clause_chunks_tenant_version
  ON contract_clause_chunks (tenant_id, version_id, stale, chunk_ordinal);

ALTER TABLE contract_clause_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_clause_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_clause_chunks_tenant ON contract_clause_chunks
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_clause_chunks TO vault_app;
GRANT UPDATE (
  chunk_id,
  chunk_ordinal,
  start_offset,
  end_offset,
  text_hash,
  stale,
  updated_at
) ON contract_clause_chunks TO vault_app;

CREATE TABLE contract_defined_terms (
  term_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_id uuid NOT NULL,
  normalized_term_key text NOT NULL CHECK (normalized_term_key ~ '^[a-z0-9 _.-]{1,120}$'),
  term_hash char(64) NOT NULL CHECK (term_hash ~ '^[0-9a-f]{64}$'),
  definition_hash char(64) NOT NULL CHECK (definition_hash ~ '^[0-9a-f]{64}$'),
  conflict_status text NOT NULL DEFAULT 'none' CHECK (conflict_status IN ('none', 'conflict')),
  conflict_ref_count integer NOT NULL DEFAULT 0 CHECK (conflict_ref_count >= 0),
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, term_id),
  UNIQUE (tenant_id, version_id, normalized_term_key, clause_id, start_offset),
  CONSTRAINT fk_contract_defined_terms_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_defined_terms_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_defined_terms_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_defined_terms_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_defined_terms_tenant_version
  ON contract_defined_terms (tenant_id, version_id, normalized_term_key, stale);

ALTER TABLE contract_defined_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_defined_terms FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_defined_terms_tenant ON contract_defined_terms
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_defined_terms TO vault_app;
GRANT UPDATE (
  term_hash,
  definition_hash,
  conflict_status,
  conflict_ref_count,
  start_offset,
  end_offset,
  stale,
  updated_at
) ON contract_defined_terms TO vault_app;

CREATE TABLE contract_redline_changes (
  redline_change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_id uuid,
  change_type text NOT NULL CHECK (change_type IN ('added', 'deleted')),
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  text_hash char(64) NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  parser_version text NOT NULL CHECK (parser_version ~ '^r8-[a-z0-9.-]{1,32}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, redline_change_id),
  UNIQUE (tenant_id, version_id, change_type, start_offset, end_offset, text_hash),
  CONSTRAINT fk_contract_redline_changes_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_redline_changes_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_redline_changes_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_redline_changes_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_redline_changes_tenant_version
  ON contract_redline_changes (tenant_id, version_id, change_type, stale);

ALTER TABLE contract_redline_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_redline_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_redline_changes_tenant ON contract_redline_changes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_redline_changes TO vault_app;
GRANT UPDATE (
  clause_id,
  change_type,
  start_offset,
  end_offset,
  text_hash,
  parser_version,
  stale,
  updated_at
) ON contract_redline_changes TO vault_app;

CREATE TABLE playbook_rules (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid,
  rule_key text NOT NULL CHECK (rule_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  rule_type text NOT NULL CHECK (rule_type IN ('required_clause', 'prohibited_term', 'threshold')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  expression_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  expression_hash char(64) NOT NULL CHECK (expression_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_id),
  UNIQUE (tenant_id, rule_key, version_number),
  CONSTRAINT fk_playbook_rules_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_playbook_rules_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_playbook_rules_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (jsonb_typeof(expression_json) = 'object'),
  CHECK (NOT (expression_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token']))
);

CREATE INDEX idx_playbook_rules_tenant_status
  ON playbook_rules (tenant_id, status, rule_key, version_number DESC);

ALTER TABLE playbook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_playbook_rules_tenant ON playbook_rules
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON playbook_rules TO vault_app;
GRANT UPDATE (
  matter_id,
  rule_type,
  severity,
  expression_json,
  expression_hash,
  status,
  version_number,
  updated_by,
  updated_at
) ON playbook_rules TO vault_app;

COMMENT ON TABLE contract_clauses IS
  'R8 derived contract clauses. Stores offsets, hashes, and provenance IDs only; clause body is resolved from canonical_documents after permission checks.';

COMMENT ON TABLE playbook_rules IS
  'R8 deterministic playbook rule store. Expression JSON is bounded metadata and must not contain document text or secrets.';

-- Down Migration

DROP TABLE IF EXISTS contract_redline_changes;
DROP TABLE IF EXISTS contract_defined_terms;
DROP TABLE IF EXISTS contract_clause_chunks;
DROP TABLE IF EXISTS contract_clauses;
DROP TABLE IF EXISTS playbook_rules;
DROP TABLE IF EXISTS contract_classifications;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R8 contract audit rows have been recorded,
-- rollback cannot safely remove CONTRACT_* or PLAYBOOK_* actions from the allow-list.
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
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
