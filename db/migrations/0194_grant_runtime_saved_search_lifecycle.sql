-- Up Migration

-- Existing tenant-scoped saved-search persistence. The table stores request
-- definitions and bounded filter references, never search results or snippets.
GRANT SELECT, INSERT ON saved_searches TO vault_app;
GRANT UPDATE (
  scope_type,
  matter_id,
  search_query_json,
  query_hash,
  filter_refs,
  revoked_at,
  revoked_by,
  updated_at,
  opened_count,
  last_opened_at
) ON saved_searches TO vault_app;

-- Down Migration

REVOKE SELECT, INSERT ON saved_searches FROM vault_app;
REVOKE UPDATE (
  scope_type,
  matter_id,
  search_query_json,
  query_hash,
  filter_refs,
  revoked_at,
  revoked_by,
  updated_at,
  opened_count,
  last_opened_at
) ON saved_searches FROM vault_app;
