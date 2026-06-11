-- Up Migration

CREATE TABLE document_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  version_status text NOT NULL DEFAULT 'current'
    CHECK (version_status IN ('current', 'superseded')),
  file_object_id uuid NOT NULL,
  file_hash char(64) NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_version_id uuid,
  UNIQUE (tenant_id, version_id),
  UNIQUE (tenant_id, document_id, version_no),
  UNIQUE (tenant_id, file_object_id),
  CONSTRAINT fk_document_versions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_versions_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_versions_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_versions_supersedes
    FOREIGN KEY (tenant_id, supersedes_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_document_versions_current
  ON document_versions (tenant_id, document_id)
  WHERE version_status = 'current';

CREATE INDEX idx_document_versions_document_created
  ON document_versions (tenant_id, document_id, version_no DESC);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_versions_tenant ON document_versions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_versions TO vault_app;
GRANT UPDATE (version_status) ON document_versions TO vault_app;

COMMENT ON TABLE document_versions IS
  'Immutable document version records. New versions create new file_objects rows; only current->superseded status transition is updated.';

-- Down Migration

DROP TABLE IF EXISTS document_versions;
