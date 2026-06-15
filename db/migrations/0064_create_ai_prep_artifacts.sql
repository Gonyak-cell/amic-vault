-- Up Migration

CREATE FUNCTION ai_prep_payload_top_level_keys_allowed(payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(payload) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(payload) AS key_name(key)
      WHERE key NOT IN ('answer', 'sections', 'claims', 'warnings', 'source_refs')
         OR key IN ('body', 'content', 'text', 'snippet', 'raw', 'prompt', 'response')
    );
$$;

CREATE FUNCTION ai_prep_source_hashes_allowed(source_hashes jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(source_hashes) = 'array'
    AND jsonb_array_length(source_hashes) BETWEEN 0 AND 50
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(source_hashes) AS hash_value(value)
      WHERE value !~ '^[0-9a-f]{64}$'
    );
$$;

CREATE TABLE ai_prep_artifacts (
  ai_prep_artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  artifact_kind text NOT NULL CHECK (
    artifact_kind IN (
      'document_brief',
      'key_terms',
      'issue_candidates',
      'risk_candidates',
      'timeline_candidates',
      'clause_pointers',
      'suggested_questions'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'completed', 'blocked', 'failed', 'stale')
  ),
  model_route text NOT NULL DEFAULT 'local_gemma' CHECK (model_route = 'local_gemma'),
  model_name text,
  source_chunk_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  source_hashes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    ai_prep_source_hashes_allowed(source_hashes)
  ),
  prompt_hash char(64) CHECK (prompt_hash IS NULL OR prompt_hash ~ '^[0-9a-f]{64}$'),
  response_hash char(64) CHECK (response_hash IS NULL OR response_hash ~ '^[0-9a-f]{64}$'),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    ai_prep_payload_top_level_keys_allowed(payload_json)
  ),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  is_stale boolean NOT NULL DEFAULT false,
  stale_reason text CHECK (stale_reason IS NULL OR char_length(stale_reason) BETWEEN 1 AND 120),
  failure_reason_code text CHECK (
    failure_reason_code IS NULL OR failure_reason_code ~ '^[A-Z0-9_]{1,80}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  stale_at timestamptz,
  UNIQUE (tenant_id, ai_prep_artifact_id),
  UNIQUE (tenant_id, document_version_id, artifact_kind),
  CONSTRAINT fk_ai_prep_artifacts_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_artifacts_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_prep_artifacts_document_version
    FOREIGN KEY (tenant_id, document_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'completed' AND generated_at IS NOT NULL AND response_hash IS NOT NULL)
    OR status <> 'completed'
  ),
  CHECK (
    (status IN ('blocked', 'failed') AND failure_reason_code IS NOT NULL)
    OR status NOT IN ('blocked', 'failed')
  ),
  CHECK (
    (is_stale = true AND stale_at IS NOT NULL AND stale_reason IS NOT NULL)
    OR is_stale = false
  )
);

CREATE INDEX idx_ai_prep_artifacts_tenant_matter_status
  ON ai_prep_artifacts (tenant_id, matter_id, status, artifact_kind);

CREATE INDEX idx_ai_prep_artifacts_tenant_document_stale
  ON ai_prep_artifacts (tenant_id, document_id, is_stale, artifact_kind);

CREATE INDEX idx_ai_prep_artifacts_tenant_version_kind
  ON ai_prep_artifacts (tenant_id, document_version_id, artifact_kind);

ALTER TABLE ai_prep_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prep_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_prep_artifacts_tenant ON ai_prep_artifacts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_prep_artifacts TO vault_app;
GRANT UPDATE (
  status,
  model_name,
  source_chunk_ids,
  source_hashes,
  prompt_hash,
  response_hash,
  payload_json,
  latency_ms,
  is_stale,
  stale_reason,
  failure_reason_code,
  updated_at,
  generated_at,
  stale_at
) ON ai_prep_artifacts TO vault_app;

COMMENT ON TABLE ai_prep_artifacts IS
  'Local-only post-upload AI preparation artifacts. Payloads store bounded grounded outputs and hashes, never raw source text, prompts, or raw model responses.';

COMMENT ON COLUMN ai_prep_artifacts.prompt_hash IS
  'SHA-256 hash of the compiled local prompt. Prompt text is never stored.';

COMMENT ON COLUMN ai_prep_artifacts.response_hash IS
  'SHA-256 hash of the accepted bounded local model output. Raw response text is never stored.';

-- Down Migration

DROP TABLE IF EXISTS ai_prep_artifacts;
DROP FUNCTION IF EXISTS ai_prep_source_hashes_allowed(jsonb);
DROP FUNCTION IF EXISTS ai_prep_payload_top_level_keys_allowed(jsonb);
