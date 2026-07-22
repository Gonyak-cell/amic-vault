-- Up Migration

-- Reparse replaces tenant-scoped participants, then refreshes only the two
-- participant metadata fields not granted by the classification lifecycle.
GRANT UPDATE (domain_ref, display_name) ON email_participants TO vault_app;
GRANT DELETE ON email_participants TO vault_app;

-- Down Migration

REVOKE UPDATE (domain_ref, display_name) ON email_participants FROM vault_app;
REVOKE DELETE ON email_participants FROM vault_app;
