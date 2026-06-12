-- Up Migration

CREATE TABLE email_document_links (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  email_id uuid NOT NULL,
  document_id uuid NOT NULL,
  file_object_id uuid NOT NULL,
  attachment_index integer NOT NULL CHECK (attachment_index >= 0),
  attachment_filename text NOT NULL CHECK (
    char_length(attachment_filename) BETWEEN 1 AND 255
    AND attachment_filename NOT LIKE '%/%'
    AND attachment_filename NOT LIKE E'%\\\\%'
    AND attachment_filename !~ E'[\\r\\n]'
  ),
  media_type text NOT NULL CHECK (
    char_length(media_type) BETWEEN 1 AND 255
    AND media_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
  ),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, link_id),
  UNIQUE (tenant_id, email_id, attachment_index),
  UNIQUE (tenant_id, email_id, document_id),
  CONSTRAINT fk_email_document_links_email
    FOREIGN KEY (tenant_id, email_id)
    REFERENCES email_messages (tenant_id, email_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_document_links_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_email_document_links_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects (tenant_id, file_object_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_email_document_links_tenant_email
  ON email_document_links (tenant_id, email_id, attachment_index);

CREATE INDEX idx_email_document_links_tenant_document
  ON email_document_links (tenant_id, document_id, created_at DESC);

CREATE INDEX idx_email_document_links_tenant_file
  ON email_document_links (tenant_id, file_object_id);

ALTER TABLE email_document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_document_links FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_document_links_tenant ON email_document_links
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON email_document_links TO vault_app;

COMMENT ON TABLE email_document_links IS
  'Tenant-scoped references from imported emails to document-pipeline attachment documents. Stores bounded metadata and hashes only; attachment bytes remain in file_objects/object storage.';

COMMENT ON COLUMN email_document_links.attachment_filename IS
  'Sanitized attachment filename used for document upload. Path separators, NUL, CR, and LF are forbidden.';

-- Down Migration

DROP TABLE IF EXISTS email_document_links;
