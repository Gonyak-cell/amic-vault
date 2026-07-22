-- Up Migration

-- Existing indexing removes only obsolete model-route rows for one
-- tenant/version-scoped derived embedding cache. Originals and audit data are
-- not part of this table or query.
GRANT DELETE ON document_chunk_embeddings TO vault_app;

-- Down Migration

REVOKE DELETE ON document_chunk_embeddings FROM vault_app;
