-- Up Migration

CREATE TABLE sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  mfa_verified boolean NOT NULL DEFAULT false,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (tenant_id, session_id),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$')
);

CREATE INDEX idx_sessions_tenant_user_active ON sessions (tenant_id, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_token_hash_active ON sessions (token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_sessions_tenant ON sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON sessions TO vault_app;
GRANT UPDATE (last_login_at, mfa_enabled, updated_at) ON users TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS sessions;
