-- Up Migration

CREATE TABLE groups (
  group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  group_type text NOT NULL CHECK (group_type IN ('practice_group', 'team', 'custom')),
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_id),
  UNIQUE (tenant_id, name),
  CONSTRAINT fk_groups_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_group_members_group
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES groups (tenant_id, group_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_group_members_added_by
    FOREIGN KEY (tenant_id, added_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE permissions (
  permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'group', 'role')),
  subject_id text NOT NULL CHECK (char_length(subject_id) BETWEEN 1 AND 200),
  resource_type text NOT NULL CHECK (resource_type IN ('matter', 'document', 'client')),
  resource_id uuid NOT NULL,
  action text NOT NULL CHECK (
    action IN (
      'read',
      'edit',
      'upload',
      'download',
      'delete',
      'restore',
      'manage_members',
      'manage_permissions',
      'share_external'
    )
  ),
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  condition_json jsonb,
  priority integer NOT NULL DEFAULT 100,
  valid_from timestamptz,
  valid_to timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (condition_json IS NULL OR jsonb_typeof(condition_json) = 'object'),
  CHECK (
    condition_json IS NULL
    OR NOT (condition_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token'])
  ),
  CONSTRAINT fk_permissions_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_group_members_tenant_user ON group_members (tenant_id, user_id);
CREATE INDEX idx_permissions_subject ON permissions (tenant_id, subject_type, subject_id);
CREATE INDEX idx_permissions_resource ON permissions (tenant_id, resource_type, resource_id, action);
CREATE INDEX idx_permissions_validity ON permissions (tenant_id, valid_from, valid_to);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_groups_tenant ON groups
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_group_members_tenant ON group_members
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_permissions_tenant ON permissions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON groups TO vault_app;
GRANT SELECT, INSERT, DELETE ON group_members TO vault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON permissions TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;

