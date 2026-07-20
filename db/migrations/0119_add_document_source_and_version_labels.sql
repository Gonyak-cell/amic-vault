-- Up Migration

ALTER TABLE documents
  ADD COLUMN source text NOT NULL DEFAULT 'internal_work_product',
  ADD CONSTRAINT documents_source_check CHECK (
    source IN ('client_provided', 'counterparty_provided', 'internal_work_product', 'public')
  );

CREATE INDEX idx_documents_tenant_source
  ON documents (tenant_id, source, created_at DESC, document_id);

GRANT UPDATE (source, updated_at) ON documents TO vault_app;

ALTER TABLE document_versions
  ADD COLUMN version_label text,
  ADD COLUMN version_significance text NOT NULL DEFAULT 'internal_draft',
  ADD COLUMN rendition_type text NOT NULL DEFAULT 'clean',
  ADD COLUMN base_clean_version_id uuid,
  ADD CONSTRAINT document_versions_version_label_check CHECK (
    version_label IS NULL OR char_length(version_label) BETWEEN 1 AND 80
  ),
  ADD CONSTRAINT document_versions_version_significance_check CHECK (
    version_significance IN (
      'internal_draft',
      'client_sent',
      'counterparty_sent',
      'negotiation',
      'final',
      'execution_copy'
    )
  ),
  ADD CONSTRAINT document_versions_rendition_type_check CHECK (
    rendition_type IN ('clean', 'markup')
  ),
  ADD CONSTRAINT document_versions_markup_base_check CHECK (
    (rendition_type = 'markup' AND base_clean_version_id IS NOT NULL)
    OR (rendition_type = 'clean' AND base_clean_version_id IS NULL)
  ),
  ADD CONSTRAINT document_versions_tenant_document_version_id_unique
    UNIQUE (tenant_id, document_id, version_id),
  ADD CONSTRAINT fk_document_versions_base_clean_version
    FOREIGN KEY (tenant_id, document_id, base_clean_version_id)
    REFERENCES document_versions (tenant_id, document_id, version_id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN documents.source IS
  'Legal source classification for document provenance. Values are bounded and do not imply external sharing policy.';
COMMENT ON COLUMN document_versions.version_label IS
  'Human-readable version label such as v1.0 or Final. Bounded metadata only; no document text or client secret.';
COMMENT ON COLUMN document_versions.version_significance IS
  'Practical legal significance for this version: internal draft, client sent, counterparty sent, negotiation, final, or execution copy.';
COMMENT ON COLUMN document_versions.rendition_type IS
  'Clean or markup rendition marker. Markup versions must reference a base clean version in the same document.';

-- Down Migration

ALTER TABLE document_versions
  DROP CONSTRAINT IF EXISTS fk_document_versions_base_clean_version,
  DROP CONSTRAINT IF EXISTS document_versions_tenant_document_version_id_unique,
  DROP CONSTRAINT IF EXISTS document_versions_markup_base_check,
  DROP CONSTRAINT IF EXISTS document_versions_rendition_type_check,
  DROP CONSTRAINT IF EXISTS document_versions_version_significance_check,
  DROP CONSTRAINT IF EXISTS document_versions_version_label_check,
  DROP COLUMN IF EXISTS base_clean_version_id,
  DROP COLUMN IF EXISTS rendition_type,
  DROP COLUMN IF EXISTS version_significance,
  DROP COLUMN IF EXISTS version_label;

DROP INDEX IF EXISTS idx_documents_tenant_source;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_source_check,
  DROP COLUMN IF EXISTS source;
