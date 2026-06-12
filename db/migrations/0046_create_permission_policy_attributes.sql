-- Up Migration

CREATE TABLE permission_policy_attributes (
  attribute_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  attribute_key text NOT NULL CHECK (
    attribute_key IN (
      'actor.role',
      'actor.practice_group',
      'matter.status',
      'matter.practice_group',
      'matter.client_id',
      'document.status',
      'document.document_type',
      'document.confidentiality_level',
      'document.privilege_status'
    )
  ),
  resource_scope text NOT NULL CHECK (resource_scope IN ('actor', 'matter', 'document')),
  value_type text NOT NULL CHECK (value_type IN ('string', 'uuid', 'boolean')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attribute_key),
  UNIQUE (tenant_id, attribute_id)
);

CREATE INDEX idx_permission_policy_attributes_scope
  ON permission_policy_attributes (tenant_id, resource_scope, status);

ALTER TABLE permission_policy_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_policy_attributes FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_permission_policy_attributes_tenant ON permission_policy_attributes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON permission_policy_attributes TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS permission_policy_attributes;
