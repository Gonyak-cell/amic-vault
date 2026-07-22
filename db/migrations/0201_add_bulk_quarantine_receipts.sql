-- Up Migration
-- QRT-004 records an opaque security intake receipt without claiming a document
-- or immutable file object has been created.

ALTER TABLE bulk_upload_batch_items
  ADD COLUMN quarantine_ref uuid;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'bulk_upload_batch_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%''pending''%'
    AND pg_get_constraintdef(oid) LIKE '%''uploaded''%'
    AND pg_get_constraintdef(oid) LIKE '%''duplicate''%'
    AND pg_get_constraintdef(oid) LIKE '%''done''%'
    AND pg_get_constraintdef(oid) NOT LIKE '%document_id%'
  LIMIT 1;
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'bulk upload item status check not found';
  END IF;
  EXECUTE format('ALTER TABLE bulk_upload_batch_items DROP CONSTRAINT %I', constraint_name);
END $$;

ALTER TABLE bulk_upload_batch_items
  ADD CONSTRAINT bulk_upload_batch_items_status_check CHECK (
    status IN ('pending', 'uploaded', 'failed', 'duplicate', 'done', 'quarantined')
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'bulk_upload_batch_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status = ''done''%'
    AND pg_get_constraintdef(oid) LIKE '%document_id%'
    AND pg_get_constraintdef(oid) LIKE '%file_object_id%'
  LIMIT 1;
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'bulk upload item completion check not found';
  END IF;
  EXECUTE format('ALTER TABLE bulk_upload_batch_items DROP CONSTRAINT %I', constraint_name);
END $$;

ALTER TABLE bulk_upload_batch_items
  ADD CONSTRAINT bulk_upload_batch_items_completion_check CHECK (
    (status = 'done' AND document_id IS NOT NULL AND file_object_id IS NOT NULL AND error_code IS NULL AND quarantine_ref IS NULL)
    OR (status = 'quarantined' AND document_id IS NULL AND file_object_id IS NULL AND error_code IS NULL AND quarantine_ref IS NOT NULL)
    OR (status IN ('failed', 'duplicate') AND error_code IS NOT NULL AND quarantine_ref IS NULL)
    OR (status IN ('pending', 'uploaded') AND document_id IS NULL AND file_object_id IS NULL AND quarantine_ref IS NULL)
  );

GRANT UPDATE (quarantine_ref) ON bulk_upload_batch_items TO vault_app;

-- Down Migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bulk_upload_batch_items WHERE status = 'quarantined') THEN
    RAISE EXCEPTION 'cannot rollback 0201 while quarantine receipts exist';
  END IF;
END $$;

REVOKE UPDATE (quarantine_ref) ON bulk_upload_batch_items FROM vault_app;
ALTER TABLE bulk_upload_batch_items DROP CONSTRAINT bulk_upload_batch_items_completion_check;
ALTER TABLE bulk_upload_batch_items DROP CONSTRAINT bulk_upload_batch_items_status_check;
ALTER TABLE bulk_upload_batch_items
  ADD CONSTRAINT bulk_upload_batch_items_status_check CHECK (
    status IN ('pending', 'uploaded', 'failed', 'duplicate', 'done')
  );
ALTER TABLE bulk_upload_batch_items
  ADD CONSTRAINT bulk_upload_batch_items_completion_check CHECK (
    (status = 'done' AND document_id IS NOT NULL AND file_object_id IS NOT NULL AND error_code IS NULL)
    OR (status IN ('failed', 'duplicate') AND error_code IS NOT NULL)
    OR (status IN ('pending', 'uploaded') AND document_id IS NULL AND file_object_id IS NULL)
  );
ALTER TABLE bulk_upload_batch_items DROP COLUMN quarantine_ref;
