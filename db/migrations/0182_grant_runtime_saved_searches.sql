-- Up Migration

-- Existing SearchService saved-search workflows run through the runtime
-- tenant transaction. Preserve RLS and grant only their read, insert, and
-- exact update columns; no DELETE, policy, or scope-query change is allowed.
GRANT SELECT, INSERT ON saved_searches TO vault_app;

GRANT UPDATE (
  scope_type, matter_id, search_query_json, query_hash, filter_refs,
  revoked_at, revoked_by, opened_count, last_opened_at, updated_at
) ON saved_searches TO vault_app;

-- Down Migration

REVOKE UPDATE (
  scope_type, matter_id, search_query_json, query_hash, filter_refs,
  revoked_at, revoked_by, opened_count, last_opened_at, updated_at
) ON saved_searches FROM vault_app;

REVOKE SELECT, INSERT ON saved_searches FROM vault_app;
