-- Up Migration

CREATE TABLE parties (
  party_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1000),
  party_type text NOT NULL DEFAULT 'corporation',
  party_role text NOT NULL,
  related_client_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, party_id),
  CONSTRAINT fk_parties_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_parties_related_client
    FOREIGN KEY (tenant_id, related_client_id)
    REFERENCES clients (tenant_id, client_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_parties_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_parties_matter ON parties (tenant_id, matter_id);
CREATE INDEX idx_parties_related_client ON parties (tenant_id, related_client_id)
  WHERE related_client_id IS NOT NULL;

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_parties_tenant ON parties
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON parties TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS parties;
