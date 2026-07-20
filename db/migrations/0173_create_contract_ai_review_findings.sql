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
    SELECT 'CONTRACT_AI_REVIEW_ACCEPTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE contract_ai_review_findings (
  finding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_id uuid,
  ai_session_id uuid NOT NULL,
  ai_claim_id uuid NOT NULL,
  ai_source text NOT NULL DEFAULT 'local_gemma' CHECK (ai_source = 'local_gemma'),
  review_task text NOT NULL CHECK (review_task IN ('clause_analysis', 'risk_extraction')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  finding_code text NOT NULL CHECK (
    char_length(finding_code) BETWEEN 1 AND 120
    AND finding_code ~ '^[a-z0-9._:-]+$'
  ),
  finding_hash char(64) NOT NULL CHECK (finding_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, finding_id),
  UNIQUE (tenant_id, document_id, version_id, ai_claim_id, review_task),
  CHECK (
    (status = 'pending' AND accepted_by IS NULL AND accepted_at IS NULL)
    OR (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
  ),
  CONSTRAINT fk_contract_ai_review_findings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_ai_session
    FOREIGN KEY (tenant_id, ai_session_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_ai_claim
    FOREIGN KEY (tenant_id, ai_claim_id)
    REFERENCES ai_claims (tenant_id, claim_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_ai_review_findings_accepted_by
    FOREIGN KEY (tenant_id, accepted_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_ai_review_findings_tenant_matter_status
  ON contract_ai_review_findings (tenant_id, matter_id, status, created_at DESC);

CREATE INDEX idx_contract_ai_review_findings_tenant_document
  ON contract_ai_review_findings (tenant_id, document_id, version_id, review_task, created_at DESC);

CREATE FUNCTION contract_ai_review_findings_claim_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_session_id uuid;
  claim_matter_id uuid;
  claim_hash char(64);
BEGIN
  SELECT claim.ai_session_id, session.matter_id, claim.claim_hash
  INTO claim_session_id, claim_matter_id, claim_hash
  FROM ai_claims claim
  JOIN ai_sessions session
    ON session.tenant_id = claim.tenant_id
    AND session.ai_session_id = claim.ai_session_id
  WHERE claim.tenant_id = NEW.tenant_id
    AND claim.claim_id = NEW.ai_claim_id;

  IF claim_session_id IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_AI_REVIEW_CLAIM_REQUIRED';
  END IF;

  IF claim_session_id <> NEW.ai_session_id OR claim_matter_id <> NEW.matter_id THEN
    RAISE EXCEPTION 'CONTRACT_AI_REVIEW_CLAIM_SCOPE_MISMATCH';
  END IF;

  IF claim_hash <> NEW.finding_hash THEN
    RAISE EXCEPTION 'CONTRACT_AI_REVIEW_CLAIM_HASH_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ai_claim_citations citation
    WHERE citation.tenant_id = NEW.tenant_id
      AND citation.claim_id = NEW.ai_claim_id
      AND citation.document_id = NEW.document_id
      AND citation.version_id = NEW.version_id
  ) THEN
    RAISE EXCEPTION 'CONTRACT_AI_REVIEW_CITATION_REQUIRED';
  END IF;

  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER contract_ai_review_findings_claim_guard_after_write
  AFTER INSERT OR UPDATE OF matter_id, document_id, version_id, ai_session_id, ai_claim_id, finding_hash
  ON contract_ai_review_findings
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION contract_ai_review_findings_claim_guard();

ALTER TABLE contract_ai_review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_ai_review_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_ai_review_findings_tenant ON contract_ai_review_findings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_ai_review_findings TO vault_app;
GRANT UPDATE (
  status,
  accepted_by,
  accepted_at,
  updated_at
) ON contract_ai_review_findings TO vault_app;

-- Down Migration

DROP TRIGGER IF EXISTS contract_ai_review_findings_claim_guard_after_write ON contract_ai_review_findings;
DROP FUNCTION IF EXISTS contract_ai_review_findings_claim_guard();
DROP TABLE IF EXISTS contract_ai_review_findings;
