-- Up Migration

CREATE TABLE example_records (
  record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  code text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE example_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_records FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_example_records_tenant ON example_records
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Down Migration

DROP TABLE IF EXISTS example_records;
