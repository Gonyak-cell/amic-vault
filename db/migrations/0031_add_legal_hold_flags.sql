-- Up Migration

ALTER TABLE documents
  ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;

ALTER TABLE matters
  ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;

CREATE INDEX idx_documents_tenant_legal_hold
  ON documents (tenant_id, legal_hold, document_id)
  WHERE legal_hold = true;

CREATE INDEX idx_matters_tenant_legal_hold
  ON matters (tenant_id, legal_hold, matter_id)
  WHERE legal_hold = true;

GRANT UPDATE (legal_hold, updated_at) ON documents TO vault_app;
GRANT UPDATE (legal_hold, updated_at) ON matters TO vault_app;

COMMENT ON COLUMN documents.legal_hold IS
  'R2 legal hold interface flag. Full legal_holds/disposal tables are forbidden until R12.';
COMMENT ON COLUMN matters.legal_hold IS
  'R2 legal hold interface flag. Applies as a delete precondition only.';

-- Down Migration

DROP INDEX IF EXISTS idx_matters_tenant_legal_hold;
DROP INDEX IF EXISTS idx_documents_tenant_legal_hold;

ALTER TABLE matters
  DROP COLUMN IF EXISTS legal_hold;

ALTER TABLE documents
  DROP COLUMN IF EXISTS legal_hold;
