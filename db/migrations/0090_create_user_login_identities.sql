-- Up Migration

CREATE TABLE user_login_identities (
  login_identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  identity_type text NOT NULL CHECK (identity_type IN ('account_ledger_id')),
  identity_value_normalized text NOT NULL CHECK (
    identity_value_normalized = lower(identity_value_normalized)
    AND identity_value_normalized ~ '^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$'
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, login_identity_id),
  UNIQUE (tenant_id, user_id, identity_type),
  UNIQUE (identity_type, identity_value_normalized),
  CONSTRAINT fk_user_login_identities_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_user_login_identities_tenant_user
  ON user_login_identities (tenant_id, user_id, identity_type, status);

ALTER TABLE user_login_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_login_identities FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_user_login_identities_tenant ON user_login_identities
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON user_login_identities TO vault_app;
GRANT UPDATE (identity_value_normalized, status, updated_at) ON user_login_identities TO vault_app;

COMMENT ON TABLE user_login_identities IS
  'Tenant-scoped login identity registry. account_ledger_id values are globally unique login aliases; raw passwords, tokens, and provider identifiers are forbidden.';
COMMENT ON COLUMN user_login_identities.identity_value_normalized IS
  'Lowercase normalized login alias. Do not write raw secrets, tokens, provider IDs, or customer document content.';

CREATE OR REPLACE FUNCTION app_find_login_candidate_by_account_ledger_id(input_account_ledger_id text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_region text,
  tenant_data_residency text,
  tenant_status text,
  tenant_created_at timestamptz,
  tenant_updated_at timestamptz,
  user_id uuid,
  user_email text,
  user_name text,
  user_role text,
  user_practice_group text,
  user_status text,
  user_password_hash text,
  user_mfa_enabled boolean,
  user_last_login_at timestamptz,
  user_created_at timestamptz,
  user_updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    t.region AS tenant_region,
    t.data_residency AS tenant_data_residency,
    t.status::text AS tenant_status,
    t.created_at AS tenant_created_at,
    t.updated_at AS tenant_updated_at,
    u.user_id,
    u.email AS user_email,
    u.name AS user_name,
    u.role::text AS user_role,
    u.practice_group AS user_practice_group,
    u.status::text AS user_status,
    u.password_hash AS user_password_hash,
    u.mfa_enabled AS user_mfa_enabled,
    u.last_login_at AS user_last_login_at,
    u.created_at AS user_created_at,
    u.updated_at AS user_updated_at
  FROM user_login_identities uli
  JOIN tenants t ON t.tenant_id = uli.tenant_id
  JOIN users u ON u.tenant_id = uli.tenant_id AND u.user_id = uli.user_id
  WHERE uli.identity_type = 'account_ledger_id'
    AND uli.status = 'active'
    AND t.status = 'active'
    AND uli.identity_value_normalized = lower(btrim(input_account_ledger_id))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_find_login_candidate_by_account_ledger_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_login_candidate_by_account_ledger_id(text) TO vault_app;

COMMENT ON FUNCTION app_find_login_candidate_by_account_ledger_id(text) IS
  'Runtime auth helper. Global account_ledger_id login resolves through a single globally unique active login alias and active tenant.';

-- Down Migration

DROP FUNCTION IF EXISTS app_find_login_candidate_by_account_ledger_id(text);
DROP TABLE IF EXISTS user_login_identities;
