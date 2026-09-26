-- Up Migration

ALTER TABLE documents
  ADD COLUMN amic_os_filename text,
  ADD COLUMN amic_os_metadata_code text,
  ADD COLUMN amic_os_business_info jsonb NOT NULL DEFAULT '{"description":null,"document_type":null,"tags":[]}'::jsonb,
  ADD COLUMN amic_os_metadata_revision bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT documents_amic_os_filename_check CHECK (
    amic_os_filename IS NULL OR (
      char_length(amic_os_filename) BETWEEN 1 AND 240
      AND amic_os_filename !~ '[[:cntrl:]]'
      AND position('/' in amic_os_filename) = 0
      AND position(chr(92) in amic_os_filename) = 0
    )
  ),
  ADD CONSTRAINT documents_amic_os_metadata_code_check CHECK (
    amic_os_metadata_code IS NULL OR amic_os_metadata_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  ADD CONSTRAINT documents_amic_os_metadata_revision_check CHECK (amic_os_metadata_revision >= 0),
  ADD CONSTRAINT documents_amic_os_business_info_check CHECK (
    jsonb_typeof(amic_os_business_info) = 'object'
    AND amic_os_business_info ?& ARRAY['description', 'document_type', 'tags']
    AND NOT (amic_os_business_info ?| ARRAY['body', 'content', 'raw', 'password', 'token'])
    AND (amic_os_business_info -> 'description' = 'null'::jsonb
      OR (jsonb_typeof(amic_os_business_info -> 'description') = 'string'
        AND length(amic_os_business_info ->> 'description') <= 2000))
    AND (amic_os_business_info -> 'document_type' = 'null'::jsonb
      OR (jsonb_typeof(amic_os_business_info -> 'document_type') = 'string'
        AND length(amic_os_business_info ->> 'document_type') <= 80))
    AND CASE WHEN jsonb_typeof(amic_os_business_info -> 'tags') = 'array'
      THEN jsonb_array_length(amic_os_business_info -> 'tags') <= 20
      ELSE false END
  );

CREATE INDEX idx_documents_amic_os_metadata_code
  ON documents (tenant_id, amic_os_metadata_code, document_id)
  WHERE amic_os_metadata_code IS NOT NULL;

GRANT UPDATE (
  amic_os_filename, amic_os_metadata_code, amic_os_business_info,
  amic_os_metadata_revision, updated_at
) ON documents TO vault_app;

COMMENT ON COLUMN documents.amic_os_filename IS
  'Mutable Vault display filename. The original file object and immutable EML source keep their own names and bytes.';
COMMENT ON COLUMN documents.amic_os_metadata_code IS
  'Legacy AMIC Vault classification code, distinct from canonical Matter and Client identifiers.';

-- Down Migration

DROP INDEX IF EXISTS idx_documents_amic_os_metadata_code;
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_amic_os_business_info_check,
  DROP CONSTRAINT IF EXISTS documents_amic_os_metadata_revision_check,
  DROP CONSTRAINT IF EXISTS documents_amic_os_metadata_code_check,
  DROP CONSTRAINT IF EXISTS documents_amic_os_filename_check,
  DROP COLUMN IF EXISTS amic_os_metadata_revision,
  DROP COLUMN IF EXISTS amic_os_business_info,
  DROP COLUMN IF EXISTS amic_os_metadata_code,
  DROP COLUMN IF EXISTS amic_os_filename;
