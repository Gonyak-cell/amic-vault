-- Up Migration

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_source_system_check,
  ADD CONSTRAINT file_objects_source_system_check CHECK (
    source_system IN ('upload', 'email_ingest', 'migration', 'preview_derived')
  );

CREATE TABLE document_preview_artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  file_object_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  failure_reason_code text CHECK (
    failure_reason_code IS NULL OR failure_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, artifact_id),
  UNIQUE (tenant_id, version_id),
  CONSTRAINT fk_preview_artifacts_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_preview_artifacts_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_preview_artifacts_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'ready' AND failure_reason_code IS NULL)
    OR (status = 'failed' AND failure_reason_code IS NOT NULL)
  )
);

CREATE INDEX idx_preview_artifacts_document
  ON document_preview_artifacts (tenant_id, document_id, created_at DESC);

ALTER TABLE document_preview_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_preview_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_preview_artifacts_tenant ON document_preview_artifacts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON document_preview_artifacts TO vault_app;

COMMENT ON TABLE document_preview_artifacts IS
  'Tenant-scoped preview PDF derivatives. Rows are not document_versions and never mutate original file families.';

-- Down Migration

DROP TABLE IF EXISTS document_preview_artifacts;

ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_source_system_check,
  ADD CONSTRAINT file_objects_source_system_check CHECK (
    source_system IN ('upload', 'email_ingest', 'migration')
  );
