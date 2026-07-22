-- Up Migration

-- Existing token-resolved NDA acceptance uses this no-op conflict update to
-- return the original acceptance timestamp. Tenant RLS and audit remain
-- authoritative; no link or token field is changed.
GRANT UPDATE (accepted_at) ON external_nda_acceptances TO vault_app;

-- Down Migration

REVOKE UPDATE (accepted_at) ON external_nda_acceptances FROM vault_app;
