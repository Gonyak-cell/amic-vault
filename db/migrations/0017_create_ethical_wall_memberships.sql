-- Up Migration

CREATE TABLE ethical_wall_memberships (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'group')),
  subject_id uuid NOT NULL,
  membership_type text NOT NULL CHECK (membership_type IN ('insider', 'excluded')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wall_id, subject_type, subject_id),
  CONSTRAINT fk_ethical_wall_memberships_wall
    FOREIGN KEY (tenant_id, wall_id)
    REFERENCES ethical_walls (tenant_id, wall_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ethical_wall_memberships_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_ethical_wall_memberships_subject
  ON ethical_wall_memberships (tenant_id, subject_type, subject_id, membership_type);

ALTER TABLE ethical_wall_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethical_wall_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ethical_wall_memberships_tenant ON ethical_wall_memberships
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON ethical_wall_memberships TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS ethical_wall_memberships;

