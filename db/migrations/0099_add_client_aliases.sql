-- Up Migration

ALTER TABLE clients
  ADD COLUMN aliases text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE clients
  ADD CONSTRAINT chk_clients_aliases_bounded
  CHECK (cardinality(aliases) <= 20);

CREATE INDEX idx_clients_tenant_aliases ON clients USING gin (aliases);

-- Down Migration

DROP INDEX IF EXISTS idx_clients_tenant_aliases;

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS chk_clients_aliases_bounded;

ALTER TABLE clients
  DROP COLUMN IF EXISTS aliases;
