-- Up Migration

-- Existing audited undo and body-indexing flows respectively delete a filing
-- and fill its immutable document reference once. RLS remains authoritative.
GRANT DELETE ON email_matter_filings TO vault_app;
GRANT UPDATE (body_document_id) ON email_matter_filings TO vault_app;

-- Down Migration

REVOKE DELETE ON email_matter_filings FROM vault_app;
REVOKE UPDATE (body_document_id) ON email_matter_filings FROM vault_app;
