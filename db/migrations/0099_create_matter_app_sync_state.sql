-- Up Migration

CREATE TABLE matter_app_sync_state (
  sync_state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source_ref text NOT NULL,
  last_sync_at timestamptz NOT NULL,
  reflected_count integer NOT NULL DEFAULT 0 CHECK (reflected_count >= 0),
  drift_count integer NOT NULL DEFAULT 0 CHECK (drift_count >= 0),
  source_revision_hash text NOT NULL CHECK (source_revision_hash ~ '^[0-9a-f]{64}$'),
  source_artifact_hash text NOT NULL CHECK (source_artifact_hash ~ '^[0-9a-f]{64}$'),
  run_id_hash text NOT NULL CHECK (run_id_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pass', 'blocked')),
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_ref),
  UNIQUE (tenant_id, sync_state_id),
  CHECK (source_ref ~ '^[a-z0-9_:-]{3,80}$'),
  CHECK (jsonb_typeof(summary_json) = 'object')
);

CREATE INDEX idx_matter_app_sync_state_tenant_last_sync
  ON matter_app_sync_state (tenant_id, last_sync_at DESC);

ALTER TABLE matter_app_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_app_sync_state FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_app_sync_state_tenant ON matter_app_sync_state
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON matter_app_sync_state TO vault_app;
GRANT UPDATE (
  last_sync_at,
  reflected_count,
  drift_count,
  source_revision_hash,
  source_artifact_hash,
  run_id_hash,
  status,
  summary_json,
  updated_at
) ON matter_app_sync_state TO vault_app;

COMMENT ON TABLE matter_app_sync_state IS
  'Tenant-scoped sanitized Matter app sync health. Stores counts, hashes, and timestamps only; no raw matter names, client names, document text, or external credentials.';

-- Down Migration

DROP TABLE IF EXISTS matter_app_sync_state;
