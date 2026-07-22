-- Up Migration

-- Existing Matter-wiki draft regeneration refreshes only generator provenance
-- metadata during its tenant-scoped, audited conflict update.
GRANT UPDATE (generated_by, generated_at) ON matter_wiki_pages TO vault_app;

-- Down Migration

REVOKE UPDATE (generated_by, generated_at) ON matter_wiki_pages FROM vault_app;
