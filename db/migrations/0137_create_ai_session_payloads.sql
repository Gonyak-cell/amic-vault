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
    SELECT 'AI_PAYLOAD_VIEWED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE ai_session_payloads (
  ai_session_payload_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  ai_session_id uuid NOT NULL,
  prompt_text text NOT NULL CHECK (char_length(prompt_text) BETWEEN 0 AND 20000),
  response_text text NOT NULL CHECK (char_length(response_text) BETWEEN 0 AND 20000),
  prompt_hash char(64) NOT NULL CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
  response_hash char(64) NOT NULL CHECK (response_hash ~ '^[0-9a-f]{64}$'),
  prompt_length integer NOT NULL CHECK (prompt_length BETWEEN 0 AND 20000),
  response_length integer NOT NULL CHECK (response_length BETWEEN 0 AND 20000),
  risk_flag boolean NOT NULL DEFAULT false,
  dlp_finding_count integer NOT NULL DEFAULT 0 CHECK (dlp_finding_count BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ai_session_payload_id),
  UNIQUE (tenant_id, ai_session_id),
  CONSTRAINT fk_ai_session_payloads_session
    FOREIGN KEY (tenant_id, ai_session_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id)
    ON DELETE RESTRICT,
  CONSTRAINT ai_session_payloads_prompt_integrity_check
    CHECK (char_length(prompt_text) = prompt_length),
  CONSTRAINT ai_session_payloads_response_integrity_check
    CHECK (char_length(response_text) = response_length)
);

CREATE INDEX idx_ai_session_payloads_tenant_session
  ON ai_session_payloads (tenant_id, ai_session_id, updated_at DESC);

ALTER TABLE ai_session_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_session_payloads FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_session_payloads_tenant ON ai_session_payloads
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON ai_session_payloads TO vault_app;
GRANT UPDATE (
  prompt_text,
  response_text,
  prompt_hash,
  response_hash,
  prompt_length,
  response_length,
  risk_flag,
  dlp_finding_count,
  updated_at
) ON ai_session_payloads TO vault_app;

COMMENT ON TABLE ai_session_payloads IS
  'E5 security-admin-only AI session payload store. Contains raw prompt and response text for audit review; audit_events must continue to store references, hashes, and counts only.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action = 'AI_PAYLOAD_VIEWED'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove AI_PAYLOAD_VIEWED from audit_events_action_check while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> 'AI_PAYLOAD_VIEWED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS ai_session_payloads;
