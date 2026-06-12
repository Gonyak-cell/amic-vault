-- Up Migration

CREATE TABLE ai_sessions (
  ai_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  auth_session_id uuid,
  model_route text NOT NULL DEFAULT 'local_gemma' CHECK (model_route = 'local_gemma'),
  status text NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'retrieved', 'responded', 'blocked', 'failed')
  ),
  prompt_hash char(64) NOT NULL CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
  prompt_length integer NOT NULL CHECK (prompt_length BETWEEN 0 AND 20000),
  response_hash char(64) CHECK (response_hash IS NULL OR response_hash ~ '^[0-9a-f]{64}$'),
  response_length integer CHECK (response_length IS NULL OR response_length BETWEEN 0 AND 20000),
  response_token_count integer CHECK (
    response_token_count IS NULL OR response_token_count BETWEEN 0 AND 20000
  ),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 600000),
  escalation_required boolean NOT NULL DEFAULT false,
  blocked_reason text CHECK (
    blocked_reason IS NULL OR blocked_reason IN (
      'ai_policy_blocked',
      'permission_denied',
      'ethical_wall_blocked',
      'dlp_blocked',
      'unsupported_scope',
      'validation_failed'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ai_session_id),
  CONSTRAINT fk_ai_sessions_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_sessions_actor
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_sessions_auth_session
    FOREIGN KEY (tenant_id, auth_session_id)
    REFERENCES sessions (tenant_id, session_id)
    ON DELETE RESTRICT,
  CONSTRAINT ai_sessions_response_pair_check CHECK (
    (response_hash IS NULL AND response_length IS NULL)
    OR (response_hash IS NOT NULL AND response_length IS NOT NULL)
  )
);

CREATE INDEX idx_ai_sessions_tenant_actor_created
  ON ai_sessions (tenant_id, actor_id, created_at DESC);

CREATE INDEX idx_ai_sessions_tenant_matter_created
  ON ai_sessions (tenant_id, matter_id, created_at DESC);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_sessions_tenant ON ai_sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_sessions TO vault_app;
GRANT UPDATE (
  status,
  response_hash,
  response_length,
  response_token_count,
  latency_ms,
  escalation_required,
  blocked_reason,
  updated_at
) ON ai_sessions TO vault_app;

CREATE TABLE ai_session_chunks (
  ai_session_chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  ai_session_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  included boolean NOT NULL,
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'included',
      'permission_denied',
      'ethical_wall_blocked',
      'ai_policy_blocked',
      'dlp_redacted',
      'window_omitted',
      'missing_source',
      'unsupported_scope'
    )
  ),
  rank_index integer CHECK (rank_index IS NULL OR rank_index >= 0),
  score double precision CHECK (score IS NULL OR score >= 0),
  quote_hash char(64) NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  source_text_hash char(64) NOT NULL CHECK (source_text_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ai_session_id, chunk_id),
  CONSTRAINT fk_ai_session_chunks_session
    FOREIGN KEY (tenant_id, ai_session_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_session_chunks_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_session_chunks_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ai_session_chunks_chunk
    FOREIGN KEY (tenant_id, chunk_id)
    REFERENCES document_chunks (tenant_id, chunk_id)
    ON DELETE RESTRICT,
  CONSTRAINT ai_session_chunks_included_reason_check CHECK (
    (included = true AND reason_code = 'included')
    OR (included = false AND reason_code <> 'included')
  )
);

CREATE INDEX idx_ai_session_chunks_tenant_session
  ON ai_session_chunks (tenant_id, ai_session_id, included, rank_index);

CREATE INDEX idx_ai_session_chunks_tenant_chunk
  ON ai_session_chunks (tenant_id, chunk_id);

ALTER TABLE ai_session_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_session_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_session_chunks_tenant ON ai_session_chunks
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_session_chunks TO vault_app;

COMMENT ON TABLE ai_sessions IS
  'R6 AI session log. Stores prompt/response hashes, lengths, model route, and status only; prompt and response raw text are intentionally absent.';

COMMENT ON TABLE ai_session_chunks IS
  'R6 AI session retrieved chunk log. Stores source reference IDs, hashes, included flag, and reason codes only; chunk text and snippets are intentionally absent.';

-- Down Migration

DROP TABLE IF EXISTS ai_session_chunks;
DROP TABLE IF EXISTS ai_sessions;
