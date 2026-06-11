-- Up Migration

CREATE TABLE matter_members (
  matter_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_role text NOT NULL DEFAULT 'member'
    CHECK (matter_role IN ('owner', 'member', 'limited_reviewer')),
  access_level text NOT NULL DEFAULT 'read'
    CHECK (access_level IN ('read', 'edit')),
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matter_id, user_id),
  CONSTRAINT matter_members_limited_reviewer_read_only
    CHECK (matter_role <> 'limited_reviewer' OR access_level = 'read'),
  CONSTRAINT fk_matter_members_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_members_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_members_added_by
    FOREIGN KEY (tenant_id, added_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_matter_members_user ON matter_members (tenant_id, user_id);
CREATE INDEX idx_matter_members_matter_role ON matter_members (tenant_id, matter_id, matter_role);

INSERT INTO matter_members (
  tenant_id, matter_id, user_id, matter_role, access_level, added_by
)
SELECT tenant_id, matter_id, lead_lawyer_id, 'owner', 'edit', created_by
FROM matters
WHERE lead_lawyer_id IS NOT NULL
ON CONFLICT (matter_id, user_id) DO NOTHING;

ALTER TABLE matter_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_members FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_members_tenant ON matter_members
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON matter_members TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS matter_members;
