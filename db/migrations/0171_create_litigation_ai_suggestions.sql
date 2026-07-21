-- Up Migration

CREATE TABLE litigation_ai_suggestions (
  suggestion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid,
  suggestion_kind text NOT NULL CHECK (
    suggestion_kind IN ('evidence_classification', 'issue_evidence_mapping')
  ),
  suggested_evidence_direction text NOT NULL CHECK (suggested_evidence_direction IN ('gap', 'eul')),
  suggested_evidence_type text NOT NULL CHECK (
    suggested_evidence_type IN ('document', 'email', 'testimony', 'exhibit', 'expert', 'other')
  ),
  suggested_issue_title text CHECK (
    suggested_issue_title IS NULL
    OR (
      char_length(suggested_issue_title) BETWEEN 1 AND 200
      AND suggested_issue_title !~* '(body|content|snippet|raw|prompt|response|password|secret|token)'
    )
  ),
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_artifact_id uuid,
  source_hash text NOT NULL CHECK (source_hash ~* '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, suggestion_id),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT fk_litigation_ai_suggestions_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_ai_suggestions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_ai_suggestions_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_ai_suggestions_source_artifact
    FOREIGN KEY (tenant_id, source_artifact_id)
    REFERENCES ai_prep_artifacts (tenant_id, ai_prep_artifact_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_ai_suggestions_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_litigation_ai_suggestions_reviewed_by
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_litigation_ai_suggestions_tenant_matter_status
  ON litigation_ai_suggestions (tenant_id, matter_id, status, created_at DESC);

CREATE INDEX idx_litigation_ai_suggestions_tenant_document
  ON litigation_ai_suggestions (tenant_id, document_id, status, created_at DESC);

ALTER TABLE litigation_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE litigation_ai_suggestions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_litigation_ai_suggestions_tenant ON litigation_ai_suggestions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON litigation_ai_suggestions TO vault_app;
GRANT UPDATE (
  status,
  reviewed_by,
  reviewed_at,
  updated_at
) ON litigation_ai_suggestions TO vault_app;

COMMENT ON TABLE litigation_ai_suggestions IS
  'Bounded Litigation AI classification suggestions. Rows hold references, hashes, and review state only; they do not mutate confirmed litigation facts, issues, or evidence before human approval.';

-- Down Migration

DROP TABLE IF EXISTS litigation_ai_suggestions;
