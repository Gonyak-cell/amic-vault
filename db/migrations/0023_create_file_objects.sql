-- Up Migration

CREATE TABLE file_objects (
  file_object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  storage_uri text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 1000),
  normalized_filename text NOT NULL CHECK (char_length(normalized_filename) BETWEEN 1 AND 1000),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 255),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  encryption_key_id text,
  source_system text NOT NULL DEFAULT 'upload'
    CHECK (source_system IN ('upload', 'email_ingest', 'migration')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, file_object_id),
  CONSTRAINT fk_file_objects_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/matters/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/[0-9a-f-]{36}$')
);

CREATE INDEX idx_file_objects_tenant_created ON file_objects (tenant_id, created_at DESC, file_object_id);

ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_objects FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_file_objects_tenant ON file_objects
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON file_objects TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS file_objects;
