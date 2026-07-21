-- Up Migration

-- Existing email reparse upserts only bounded participant display/classification
-- fields, and autofile undo removes the tenant-scoped filing reference.
GRANT UPDATE (domain_ref, display_name, is_outside, participant_class)
  ON email_participants TO vault_app;
GRANT DELETE ON email_matter_filings TO vault_app;

-- Down Migration

REVOKE UPDATE (domain_ref, display_name, is_outside, participant_class)
  ON email_participants FROM vault_app;
REVOKE DELETE ON email_matter_filings FROM vault_app;
