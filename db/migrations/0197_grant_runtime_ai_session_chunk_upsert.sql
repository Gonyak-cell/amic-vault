-- Up Migration

-- AiSessionLogService's existing idempotent retrieval log refreshes these
-- tenant-scoped fields on conflict. The runtime role already has SELECT/INSERT;
-- preserve RLS and grant only the columns the existing statement updates.
GRANT UPDATE (
  included,
  reason_code,
  rank_index,
  score,
  quote_hash,
  source_text_hash
) ON ai_session_chunks TO vault_app;

-- Down Migration

REVOKE UPDATE (
  included,
  reason_code,
  rank_index,
  score,
  quote_hash,
  source_text_hash
) ON ai_session_chunks FROM vault_app;
