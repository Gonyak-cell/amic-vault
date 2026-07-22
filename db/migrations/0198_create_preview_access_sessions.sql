-- Up Migration

CREATE TABLE preview_access_sessions (
  preview_access_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, preview_access_session_id),
  CONSTRAINT preview_access_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '5 minutes'
  ),
  CONSTRAINT fk_preview_access_sessions_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_preview_access_sessions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_preview_access_sessions_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_preview_access_sessions_lookup
  ON preview_access_sessions (tenant_id, token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE preview_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_access_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_preview_access_sessions_tenant ON preview_access_sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON preview_access_sessions TO vault_app;
GRANT UPDATE (revoked_at) ON preview_access_sessions TO vault_app;

COMMENT ON TABLE preview_access_sessions IS
  'Tenant/user/document/version-bound preview access sessions. Only a SHA-256 token hash is stored.';

-- Down Migration
-- DATA-LOSS WARNING: rollback removes all preview access-session records.

DROP TABLE IF EXISTS preview_access_sessions;
