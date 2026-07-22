-- Up Migration

-- Existing reviewer assignment upserts reactivate a reviewer and replace only
-- the assigning user. Preserve RLS and the reviewer status state machine.
GRANT UPDATE (status, assigned_by, revoked_at)
  ON document_subversion_reviewers TO vault_app;

-- Down Migration

REVOKE UPDATE (status, assigned_by, revoked_at)
  ON document_subversion_reviewers FROM vault_app;
