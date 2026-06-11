-- Up Migration

ALTER TABLE documents
  ADD COLUMN document_type text NOT NULL DEFAULT 'other',
  ADD COLUMN subtype text,
  ADD COLUMN confidentiality_level text NOT NULL DEFAULT 'standard',
  ADD COLUMN privilege_status text NOT NULL DEFAULT 'none',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'contract',
      'memo',
      'opinion',
      'court_filing',
      'evidence',
      'correspondence',
      'corporate_record',
      'financial',
      'other'
    )
  ),
  ADD CONSTRAINT documents_subtype_length_check CHECK (
    subtype IS NULL OR char_length(subtype) BETWEEN 1 AND 128
  ),
  ADD CONSTRAINT documents_confidentiality_level_check CHECK (
    confidentiality_level IN ('standard', 'high', 'restricted')
  ),
  ADD CONSTRAINT documents_privilege_status_check CHECK (
    privilege_status IN ('none', 'privileged', 'work_product', 'joint_privilege')
  );

CREATE INDEX idx_documents_tenant_document_type
  ON documents (tenant_id, document_type, created_at DESC, document_id);

CREATE INDEX idx_documents_tenant_confidentiality
  ON documents (tenant_id, confidentiality_level, created_at DESC, document_id);

GRANT UPDATE (
  title,
  document_type,
  subtype,
  confidentiality_level,
  updated_at
) ON documents TO vault_app;

COMMENT ON COLUMN documents.document_type IS
  'Canonical document taxonomy. Values are enforced in shared/domain enums and the database.';
COMMENT ON COLUMN documents.privilege_status IS
  'Privilege classification is schema-only in PACK-R2-03; manual metadata editor cannot modify it.';

-- Down Migration

DROP INDEX IF EXISTS idx_documents_tenant_confidentiality;
DROP INDEX IF EXISTS idx_documents_tenant_document_type;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_privilege_status_check,
  DROP CONSTRAINT IF EXISTS documents_confidentiality_level_check,
  DROP CONSTRAINT IF EXISTS documents_subtype_length_check,
  DROP CONSTRAINT IF EXISTS documents_document_type_check,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS privilege_status,
  DROP COLUMN IF EXISTS confidentiality_level,
  DROP COLUMN IF EXISTS subtype,
  DROP COLUMN IF EXISTS document_type;
