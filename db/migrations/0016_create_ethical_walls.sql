-- Up Migration

CREATE TABLE ethical_walls (
  wall_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  wall_name text NOT NULL CHECK (char_length(wall_name) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  released_at timestamptz,
  UNIQUE (tenant_id, wall_id),
  UNIQUE (tenant_id, wall_name),
  CONSTRAINT fk_ethical_walls_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ethical_walls_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ethical_walls_released_by
    FOREIGN KEY (tenant_id, released_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'active' AND released_by IS NULL AND released_at IS NULL)
    OR
    (status = 'released' AND released_by IS NOT NULL AND released_at IS NOT NULL)
  )
);

CREATE INDEX idx_ethical_walls_tenant_matter_active
  ON ethical_walls (tenant_id, matter_id)
  WHERE status = 'active';

ALTER TABLE ethical_walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethical_walls FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ethical_walls_tenant ON ethical_walls
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON ethical_walls TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS ethical_walls;

