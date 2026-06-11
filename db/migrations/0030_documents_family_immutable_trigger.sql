-- Up Migration

CREATE OR REPLACE FUNCTION documents_block_family_update() RETURNS trigger AS $$
BEGIN
  IF NEW.document_family_id IS DISTINCT FROM OLD.document_family_id THEN
    RAISE EXCEPTION 'documents document_family_id is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documents_block_family_update
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_block_family_update();

COMMENT ON COLUMN documents.document_family_id IS
  'Document family id is set at first upload and must be inherited by subsequent versions. Updates are blocked by trigger.';

-- Down Migration

COMMENT ON COLUMN documents.document_family_id IS NULL;
DROP TRIGGER IF EXISTS trg_documents_block_family_update ON documents;
DROP FUNCTION IF EXISTS documents_block_family_update();
