-- Up Migration

CREATE TABLE clients (
  client_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1000),
  client_type text NOT NULL DEFAULT 'corporation'
    CHECK (client_type IN ('corporation', 'individual', 'government', 'fund', 'npo', 'other')),
  confidentiality_level text NOT NULL DEFAULT 'standard'
    CHECK (confidentiality_level IN ('standard', 'high', 'restricted')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dormant', 'closed')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id),
  CONSTRAINT fk_clients_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (jsonb_typeof(metadata_json) = 'object'),
  CHECK (NOT (metadata_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token']))
);

CREATE INDEX idx_clients_tenant_name ON clients (tenant_id, lower(name));
CREATE INDEX idx_clients_tenant_status ON clients (tenant_id, status);
CREATE INDEX idx_clients_tenant_type ON clients (tenant_id, client_type);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_clients_tenant ON clients
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON clients TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS clients;
