-- Up Migration

CREATE TABLE document_zip_children (
  zip_child_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  parent_document_id uuid NOT NULL,
  child_document_id uuid NOT NULL,
  batch_id uuid,
  batch_item_id text CHECK (batch_item_id IS NULL OR char_length(batch_item_id) BETWEEN 1 AND 128),
  zip_entry_path text NOT NULL CHECK (char_length(zip_entry_path) BETWEEN 1 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_document_id, child_document_id),
  UNIQUE (tenant_id, parent_document_id, zip_entry_path),
  CONSTRAINT fk_document_zip_children_parent_document
    FOREIGN KEY (tenant_id, parent_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_zip_children_child_document
    FOREIGN KEY (tenant_id, child_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_zip_children_batch
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES bulk_upload_batches (tenant_id, batch_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_zip_children_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (parent_document_id <> child_document_id),
  CHECK (
    position('/../' in '/' || replace(zip_entry_path, '\\', '/') || '/') = 0
    AND zip_entry_path !~ '^/'
    AND zip_entry_path !~ '^[A-Za-z]:'
  )
);

CREATE INDEX idx_document_zip_children_parent
  ON document_zip_children (tenant_id, parent_document_id, zip_entry_path);

CREATE INDEX idx_document_zip_children_child
  ON document_zip_children (tenant_id, child_document_id);

ALTER TABLE document_zip_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_zip_children FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_zip_children_tenant ON document_zip_children
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_zip_children TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS document_zip_children;
