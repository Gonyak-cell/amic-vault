-- Up Migration

ALTER TABLE matters
  ADD COLUMN access_scope text NOT NULL DEFAULT 'firm_open'
    CONSTRAINT matters_access_scope_check CHECK (access_scope IN ('firm_open', 'restricted'));

UPDATE matters m
SET access_scope = 'restricted',
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM ethical_walls ew
  WHERE ew.tenant_id = m.tenant_id
    AND ew.matter_id = m.matter_id
    AND ew.status = 'active'
);

CREATE INDEX idx_matters_tenant_access_scope
  ON matters (tenant_id, access_scope, matter_id);

GRANT UPDATE (access_scope, updated_at) ON matters TO vault_app;

COMMENT ON COLUMN matters.access_scope IS
  'Matter read scope. firm_open permits active firm users to read unless wall or explicit deny blocks access; restricted requires matter membership.';

-- Down Migration

DROP INDEX IF EXISTS idx_matters_tenant_access_scope;

ALTER TABLE matters
  DROP COLUMN IF EXISTS access_scope;
