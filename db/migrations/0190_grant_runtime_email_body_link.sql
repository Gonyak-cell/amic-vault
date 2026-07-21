-- Up Migration

-- Existing email-body indexing links the newly created immutable document to
-- its already-authorized filing. Preserve RLS and grant only that link column.
GRANT UPDATE (body_document_id) ON email_matter_filings TO vault_app;

-- Down Migration

REVOKE UPDATE (body_document_id) ON email_matter_filings FROM vault_app;
