-- Up Migration

CREATE TABLE password_reset_tokens (
  token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  UNIQUE (tenant_id, token_id),
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$')
);

CREATE INDEX idx_password_reset_tokens_user_active
  ON password_reset_tokens (tenant_id, user_id)
  WHERE used_at IS NULL;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_password_reset_tokens_tenant ON password_reset_tokens
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO vault_app;
GRANT UPDATE (password_hash, updated_at) ON users TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS password_reset_tokens;
