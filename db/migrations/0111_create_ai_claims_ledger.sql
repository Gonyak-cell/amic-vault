-- Up Migration
CREATE TABLE ai_claims (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  ai_session_id uuid NOT NULL,
  session_claim_id text NOT NULL CHECK (char_length(session_claim_id) BETWEEN 1 AND 120),
  claim_hash char(64) NOT NULL CHECK (claim_hash ~ '^[0-9a-f]{64}$'),
  claim_text text NOT NULL CHECK (char_length(claim_text) BETWEEN 1 AND 1600),
  kind text NOT NULL CHECK (
    kind IN ('summary', 'key_fact', 'risk', 'issue', 'timeline', 'question', 'clause', 'answer')
  ),
  is_legal_conclusion boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'cited' CHECK (
    verification_status IN ('cited', 'review_required')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_id),
  UNIQUE (tenant_id, ai_session_id, session_claim_id),
  CONSTRAINT fk_ai_claims_session
    FOREIGN KEY (tenant_id, ai_session_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id)
    ON DELETE RESTRICT
);

CREATE TABLE ai_claim_citations (
  claim_citation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  claim_id uuid NOT NULL,
  source_ref text NOT NULL CHECK (
    source_ref ~ '^chunk:[A-Za-z0-9:_-]+$'
  ),
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_id, source_ref),
  CONSTRAINT ai_claim_citations_source_ref_chunk_check
    CHECK (source_ref = 'chunk:' || chunk_id::text),
  CONSTRAINT fk_ai_claim_citations_claim
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES ai_claims (tenant_id, claim_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_claim_citations_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_claim_citations_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_claim_citations_chunk
    FOREIGN KEY (tenant_id, chunk_id)
    REFERENCES document_chunks (tenant_id, chunk_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_ai_claims_tenant_session
  ON ai_claims (tenant_id, ai_session_id, created_at, session_claim_id);

CREATE INDEX idx_ai_claim_citations_tenant_chunk
  ON ai_claim_citations (tenant_id, chunk_id);

ALTER TABLE ai_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_claim_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_claim_citations FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_claims_tenant ON ai_claims
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_ai_claim_citations_tenant ON ai_claim_citations
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_claims TO vault_app;
GRANT UPDATE (
  claim_hash,
  claim_text,
  kind,
  is_legal_conclusion,
  verification_status,
  updated_at
) ON ai_claims TO vault_app;
GRANT SELECT, INSERT ON ai_claim_citations TO vault_app;

CREATE FUNCTION ai_claim_has_citation(target_tenant_id uuid, target_claim_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ai_claim_citations
    WHERE tenant_id = target_tenant_id
      AND claim_id = target_claim_id
  );
$$;

CREATE FUNCTION ai_claim_require_citation_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_tenant_id uuid;
  target_claim_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ai_claim_citations' AND TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
      FROM ai_claims
      WHERE tenant_id = OLD.tenant_id
        AND claim_id = OLD.claim_id
    ) AND NOT ai_claim_has_citation(OLD.tenant_id, OLD.claim_id) THEN
      RAISE EXCEPTION 'AI_CLAIM_CITATION_REQUIRED';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_tenant_id := OLD.tenant_id;
    target_claim_id := OLD.claim_id;
  ELSE
    target_tenant_id := NEW.tenant_id;
    target_claim_id := NEW.claim_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ai_claims
    WHERE tenant_id = target_tenant_id
      AND claim_id = target_claim_id
  ) AND NOT ai_claim_has_citation(target_tenant_id, target_claim_id) THEN
    RAISE EXCEPTION 'AI_CLAIM_CITATION_REQUIRED';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ai_claims_require_citation_after_claim
  AFTER INSERT OR UPDATE ON ai_claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION ai_claim_require_citation_trigger();

CREATE CONSTRAINT TRIGGER ai_claims_require_citation_after_citation
  AFTER INSERT OR UPDATE OR DELETE ON ai_claim_citations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION ai_claim_require_citation_trigger();

-- Down Migration
DROP TRIGGER IF EXISTS ai_claims_require_citation_after_citation ON ai_claim_citations;
DROP TRIGGER IF EXISTS ai_claims_require_citation_after_claim ON ai_claims;
DROP FUNCTION IF EXISTS ai_claim_require_citation_trigger();
DROP FUNCTION IF EXISTS ai_claim_has_citation(uuid, uuid);
DROP TABLE IF EXISTS ai_claim_citations;
DROP TABLE IF EXISTS ai_claims;
