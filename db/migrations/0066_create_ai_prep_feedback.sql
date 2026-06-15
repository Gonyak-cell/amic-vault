-- Up Migration

CREATE TABLE ai_prep_feedback_items (
  ai_prep_feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  ai_prep_artifact_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  feedback_kind text NOT NULL CHECK (feedback_kind IN ('useful', 'incorrect', 'stale')),
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'useful',
      'incorrect_summary',
      'incorrect_key_terms',
      'incorrect_risk',
      'missing_citation',
      'stale_artifact',
      'permission_concern',
      'other_structured'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ai_prep_feedback_id),
  CONSTRAINT fk_ai_prep_feedback_artifact
    FOREIGN KEY (tenant_id, ai_prep_artifact_id)
    REFERENCES ai_prep_artifacts (tenant_id, ai_prep_artifact_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_feedback_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_feedback_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_feedback_document_version
    FOREIGN KEY (tenant_id, document_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_feedback_actor
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_ai_prep_feedback_tenant_artifact_created
  ON ai_prep_feedback_items (tenant_id, ai_prep_artifact_id, created_at DESC);

CREATE INDEX idx_ai_prep_feedback_tenant_matter_kind
  ON ai_prep_feedback_items (tenant_id, matter_id, feedback_kind, created_at DESC);

ALTER TABLE ai_prep_feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prep_feedback_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_prep_feedback_items_tenant ON ai_prep_feedback_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_prep_feedback_items TO vault_app;

COMMENT ON TABLE ai_prep_feedback_items IS
  'Structured feedback for local AI prep artifacts. Stores only artifact references and bounded reason codes; free-form comments, prompt text, source text, and model responses are intentionally absent.';

-- Down Migration

DROP TABLE IF EXISTS ai_prep_feedback_items;
