-- Up Migration

-- The existing NDA acceptance insert is idempotent and refreshes only its
-- recorded timestamp on conflict. Preserve RLS and grant only that column.
GRANT UPDATE (accepted_at) ON external_nda_acceptances TO vault_app;

-- Down Migration

REVOKE UPDATE (accepted_at) ON external_nda_acceptances FROM vault_app;
