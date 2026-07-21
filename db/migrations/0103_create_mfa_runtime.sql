-- Up Migration

CREATE TABLE mfa_secrets (
  secret_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  secret_ciphertext text NOT NULL,
  recovery_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, secret_id),
  CONSTRAINT fk_mfa_secrets_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT mfa_secrets_activation_state_check CHECK (
    (status = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_mfa_secrets_active_user
  ON mfa_secrets (tenant_id, user_id)
  WHERE status = 'active';

CREATE INDEX idx_mfa_secrets_pending_user
  ON mfa_secrets (tenant_id, user_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_secrets FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_mfa_secrets_tenant ON mfa_secrets
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON mfa_secrets TO vault_app;
GRANT UPDATE (status, recovery_codes_json, activated_at, revoked_at) ON mfa_secrets TO vault_app;

CREATE TABLE mfa_challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  challenge_token_hash text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  locked_at timestamptz,
  UNIQUE (tenant_id, challenge_id),
  CONSTRAINT fk_mfa_challenges_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (challenge_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT mfa_challenges_terminal_state_check CHECK (
    NOT (verified_at IS NOT NULL AND locked_at IS NOT NULL)
  )
);

CREATE INDEX idx_mfa_challenges_token_open
  ON mfa_challenges (challenge_token_hash)
  WHERE verified_at IS NULL AND locked_at IS NULL;

CREATE INDEX idx_mfa_challenges_user_open
  ON mfa_challenges (tenant_id, user_id, created_at DESC)
  WHERE verified_at IS NULL AND locked_at IS NULL;

ALTER TABLE mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_challenges FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_mfa_challenges_tenant ON mfa_challenges
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON mfa_challenges TO vault_app;
GRANT UPDATE (attempt_count, verified_at, locked_at) ON mfa_challenges TO vault_app;

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
    SELECT unnest(ARRAY[
      'MFA_ENROLLED',
      'MFA_CHALLENGE_SUCCEEDED',
      'MFA_CHALLENGE_FAILED'
    ])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

COMMENT ON TABLE mfa_secrets IS
  'Tenant-scoped TOTP secrets. Secret material is encrypted before storage; recovery codes are stored as one-way hashes.';
COMMENT ON TABLE mfa_challenges IS
  'Short-lived MFA login challenges issued only after password verification; no session is created until verification succeeds.';

-- Down Migration

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
      AND (
        match[1] NOT IN (
          'MFA_ENROLLED',
          'MFA_CHALLENGE_SUCCEEDED',
          'MFA_CHALLENGE_FAILED'
        )
        OR EXISTS (
          SELECT 1
          FROM audit_events ae
          WHERE ae.action = match[1]
          LIMIT 1
        )
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS mfa_challenges;
DROP TABLE IF EXISTS mfa_secrets;
