-- Up Migration

CREATE TABLE bulk_upload_batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  total_items integer NOT NULL CHECK (total_items BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id),
  CONSTRAINT fk_bulk_upload_batches_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bulk_upload_batches_actor
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE bulk_upload_batch_items (
  batch_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  item_id text NOT NULL CHECK (char_length(item_id) BETWEEN 1 AND 128),
  matter_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'failed', 'duplicate', 'done')),
  file_path text NOT NULL CHECK (char_length(file_path) BETWEEN 1 AND 2000),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 1000),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 255),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_id uuid,
  file_object_id uuid,
  error_code text,
  error_reason text,
  job_id text,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id, item_id),
  CONSTRAINT fk_bulk_upload_batch_items_batch
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES bulk_upload_batches (tenant_id, batch_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bulk_upload_batch_items_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bulk_upload_batch_items_actor
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bulk_upload_batch_items_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bulk_upload_batch_items_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CHECK (jsonb_typeof(fields_json) = 'object'),
  CHECK (NOT (fields_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token'])),
  CHECK (
    (status = 'done' AND document_id IS NOT NULL AND file_object_id IS NOT NULL AND error_code IS NULL)
    OR (status IN ('failed', 'duplicate') AND error_code IS NOT NULL)
    OR (status IN ('pending', 'uploaded') AND document_id IS NULL AND file_object_id IS NULL)
  )
);

CREATE INDEX idx_bulk_upload_batches_actor
  ON bulk_upload_batches (tenant_id, actor_user_id, created_at DESC, batch_id);

CREATE INDEX idx_bulk_upload_batch_items_batch
  ON bulk_upload_batch_items (tenant_id, batch_id, status, updated_at DESC, batch_item_id);

ALTER TABLE bulk_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_upload_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_bulk_upload_batches_tenant ON bulk_upload_batches
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE bulk_upload_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_upload_batch_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_bulk_upload_batch_items_tenant ON bulk_upload_batch_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON bulk_upload_batches TO vault_app;
GRANT UPDATE (status, updated_at) ON bulk_upload_batches TO vault_app;

GRANT SELECT, INSERT ON bulk_upload_batch_items TO vault_app;
GRANT UPDATE (
  status,
  fields_json,
  document_id,
  file_object_id,
  error_code,
  error_reason,
  job_id,
  retry_count,
  updated_at
) ON bulk_upload_batch_items TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS bulk_upload_batch_items;
DROP TABLE IF EXISTS bulk_upload_batches;
