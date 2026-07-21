-- Up Migration

-- Existing Matter Wiki regeneration refreshes only the generation actor and
-- timestamp in addition to already-granted draft/review columns. Preserve RLS.
GRANT UPDATE (generated_by, generated_at) ON matter_wiki_pages TO vault_app;

-- Down Migration

REVOKE UPDATE (generated_by, generated_at) ON matter_wiki_pages FROM vault_app;
