-- Up Migration

-- Existing bulk-upload retry refreshes the verified file size with its retry
-- state. Preserve RLS and grant only that already-written column.
GRANT UPDATE (size_bytes) ON bulk_upload_batch_items TO vault_app;

-- Down Migration

REVOKE UPDATE (size_bytes) ON bulk_upload_batch_items FROM vault_app;
