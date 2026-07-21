-- Up Migration

-- SearchIndexRepository removes only obsolete model-route embeddings inside a
-- tenant-local transaction. RLS remains the row-level boundary.
GRANT DELETE ON document_chunk_embeddings TO vault_app;

-- Down Migration

REVOKE DELETE ON document_chunk_embeddings FROM vault_app;
