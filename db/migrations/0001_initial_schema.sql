-- Up Migration

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vault_app') THEN
    CREATE ROLE vault_app LOGIN PASSWORD 'vault_app_dev_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE vault_app WITH LOGIN PASSWORD 'vault_app_dev_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO vault_app;
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO vault_app', current_database());
END
$$;

-- RLS-EXEMPT: tenants is the global tenant registry and has no owning tenant row.
CREATE TABLE tenants (
  tenant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  region text NOT NULL DEFAULT 'kr',
  data_residency text NOT NULL DEFAULT 'kr',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  practice_group text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  password_hash text NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, user_id)
);

CREATE UNIQUE INDEX idx_users_tenant_lower_email ON users (tenant_id, lower(email));
CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_users_tenant ON users
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE audit_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
  actor_id uuid,
  session_id uuid,
  action text NOT NULL CHECK (
    action IN ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'SESSION_REVOKED', 'PERMISSION_DENIED_HIT')
  ),
  target_type text NOT NULL,
  target_id uuid,
  matter_id uuid,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'denied', 'failure')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id),
  CHECK (jsonb_typeof(metadata_json) = 'object'),
  CHECK (NOT (metadata_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token']))
);

COMMENT ON COLUMN audit_events.actor_id IS
  'NULL is allowed for system events; system actor details must use whitelisted metadata keys only.';
COMMENT ON COLUMN audit_events.metadata_json IS
  'Whitelist only: reference IDs, hashes, code values, booleans, and bounded numeric values. No body/content/snippet/raw/password/token values.';

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_audit_events_tenant_select ON audit_events
  FOR SELECT
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_audit_events_tenant_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT ON tenants TO vault_app;
GRANT SELECT, INSERT ON users TO vault_app;
GRANT SELECT, INSERT ON audit_events TO vault_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM vault_app', current_database());
END
$$;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM vault_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM vault_app;
REVOKE USAGE ON SCHEMA public FROM vault_app;

DROP ROLE IF EXISTS vault_app;
