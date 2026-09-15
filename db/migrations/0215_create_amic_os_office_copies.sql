-- Up Migration

CREATE TABLE amic_os_office_copies (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  copy_id text NOT NULL CHECK (copy_id ~ '^document-copy:[0-9a-f-]{36}$'),
  source_document_id uuid NOT NULL,
  source_version_id uuid NOT NULL,
  working_document_id uuid,
  initial_snapshot_id text NOT NULL CHECK (
    initial_snapshot_id ~ '^document-copy-snapshot:[0-9a-f-]{36}$'
  ),
  final_snapshot_id text CHECK (
    final_snapshot_id IS NULL
    OR final_snapshot_id ~ '^document-copy-snapshot:[0-9a-f-]{36}$'
  ),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating', 'active', 'retained', 'saved')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, copy_id),
  CONSTRAINT fk_amic_os_office_copies_source_document
    FOREIGN KEY (tenant_id, source_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_office_copies_source_version
    FOREIGN KEY (tenant_id, source_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_office_copies_working_document
    FOREIGN KEY (tenant_id, working_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_office_copies_creator
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_amic_os_office_copies_working_document
  ON amic_os_office_copies (tenant_id, working_document_id)
  WHERE working_document_id IS NOT NULL;

CREATE INDEX idx_amic_os_office_copies_source_actor
  ON amic_os_office_copies (tenant_id, source_document_id, created_by, updated_at DESC);

ALTER TABLE amic_os_office_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE amic_os_office_copies FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_amic_os_office_copies_tenant ON amic_os_office_copies
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON amic_os_office_copies TO vault_app;
GRANT UPDATE (working_document_id, final_snapshot_id, state, updated_at) ON amic_os_office_copies TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS amic_os_office_copies;
