-- Up Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
    UNION
    SELECT 'CONTRACT_NEGOTIATION_ISSUE_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE contract_negotiation_issues (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_id uuid,
  redline_change_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  rule_key text NOT NULL CHECK (char_length(rule_key) BETWEEN 3 AND 80),
  rule_version integer NOT NULL CHECK (rule_version >= 1),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  finding_status text NOT NULL CHECK (finding_status IN ('pass', 'fail', 'unsupported')),
  finding_code text NOT NULL CHECK (
    char_length(finding_code) BETWEEN 1 AND 120
    AND finding_code ~ '^[a-z0-9._:-]+$'
  ),
  finding_hash char(64) NOT NULL CHECK (finding_hash ~ '^[0-9a-f]{64}$'),
  issue_key char(64) NOT NULL CHECK (issue_key ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'agreed', 'dropped')),
  status_changed_by uuid,
  status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issue_id),
  UNIQUE (tenant_id, issue_key),
  CHECK (
    (status = 'open' AND status_changed_by IS NULL AND status_changed_at IS NULL)
    OR (status IN ('agreed', 'dropped') AND status_changed_by IS NOT NULL AND status_changed_at IS NOT NULL)
  ),
  CONSTRAINT fk_contract_negotiation_issues_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_redline
    FOREIGN KEY (tenant_id, redline_change_id)
    REFERENCES contract_redline_changes (tenant_id, redline_change_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_rule
    FOREIGN KEY (tenant_id, rule_id)
    REFERENCES playbook_rules (tenant_id, rule_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_negotiation_issues_status_changed_by
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_negotiation_issues_tenant_matter_status
  ON contract_negotiation_issues (tenant_id, matter_id, status, updated_at DESC);

CREATE INDEX idx_contract_negotiation_issues_tenant_document
  ON contract_negotiation_issues (tenant_id, document_id, version_id, updated_at DESC);

ALTER TABLE contract_negotiation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_negotiation_issues FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_negotiation_issues_tenant ON contract_negotiation_issues
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_negotiation_issues TO vault_app;
GRANT UPDATE (
  status,
  status_changed_by,
  status_changed_at,
  updated_at
) ON contract_negotiation_issues TO vault_app;

COMMENT ON TABLE contract_negotiation_issues IS
  'G3 negotiation issue table joining redline changes to playbook findings. Stores reference IDs, hashes, and review status only; no clause or redline body text.';

-- Down Migration

DROP TABLE IF EXISTS contract_negotiation_issues;
