-- Up Migration

CREATE TABLE amic_os_native_document_copies (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  copy_id text NOT NULL CHECK (
    copy_id ~ '^document-copy:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  snapshot_id text NOT NULL CHECK (
    snapshot_id ~ '^document-copy-snapshot:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  source_document_id uuid NOT NULL,
  source_version_id uuid NOT NULL,
  source_file_object_id uuid NOT NULL,
  source_matter_id uuid NOT NULL,
  lawos_matter_id text NOT NULL CHECK (length(lawos_matter_id) BETWEEN 1 AND 256),
  quarantine_ref uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 240),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'message/rfc822')),
  mode text NOT NULL CHECK (mode IN ('clone', 'upload')),
  state text NOT NULL DEFAULT 'prepared' CHECK (
    state IN ('prepared', 'retained', 'saved', 'blocked')
  ),
  blocked_reason text CHECK (
    blocked_reason IS NULL OR blocked_reason IN ('base_version_stale', 'snapshot_unavailable')
  ),
  saved_document_id uuid,
  saved_version_id uuid,
  saved_file_object_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, copy_id, snapshot_id),
  UNIQUE (tenant_id, quarantine_ref),
  CONSTRAINT amic_os_native_document_copies_saved_binding_check CHECK (
    (state = 'saved' AND saved_document_id IS NOT NULL
      AND saved_version_id IS NOT NULL AND saved_file_object_id IS NOT NULL)
    OR (state <> 'saved' AND saved_document_id IS NULL
      AND saved_version_id IS NULL AND saved_file_object_id IS NULL)
  ),
  CONSTRAINT fk_amic_os_native_document_copies_source_document
    FOREIGN KEY (tenant_id, source_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_source_version
    FOREIGN KEY (tenant_id, source_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_source_file
    FOREIGN KEY (tenant_id, source_file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_source_matter
    FOREIGN KEY (tenant_id, source_matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_saved_document
    FOREIGN KEY (tenant_id, saved_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_saved_version
    FOREIGN KEY (tenant_id, saved_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_saved_file
    FOREIGN KEY (tenant_id, saved_file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_native_document_copies_creator
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_amic_os_native_document_copies_saved_copy
  ON amic_os_native_document_copies (tenant_id, copy_id)
  WHERE state = 'saved';

CREATE INDEX idx_amic_os_native_document_copies_source_actor
  ON amic_os_native_document_copies (
    tenant_id, source_document_id, created_by, created_at DESC, copy_id, snapshot_id
  );

ALTER TABLE amic_os_native_document_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE amic_os_native_document_copies FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_amic_os_native_document_copies_tenant
  ON amic_os_native_document_copies
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON amic_os_native_document_copies TO vault_app;
GRANT UPDATE (
  state, blocked_reason, saved_document_id, saved_version_id, saved_file_object_id, updated_at
) ON amic_os_native_document_copies TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS amic_os_native_document_copies;
