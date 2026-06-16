-- Up Migration

-- Production hotfix follow-up: ensure the runtime role can perform the
-- search-index upsert path introduced for R6 local file-organization prep.
GRANT SELECT, INSERT ON document_search_index TO vault_app;
GRANT UPDATE (
  matter_id,
  client_id,
  document_type,
  document_status,
  version_status,
  title,
  content_text,
  fts_config,
  source_text_hash,
  indexed_at,
  updated_at
) ON document_search_index TO vault_app;

GRANT SELECT, INSERT ON document_chunks TO vault_app;
GRANT UPDATE (
  document_id,
  parent_chunk_id,
  chunk_kind,
  char_start,
  char_end,
  token_count,
  chunk_text,
  text_hash,
  source_text_hash,
  stale,
  updated_at
) ON document_chunks TO vault_app;

GRANT SELECT, INSERT ON document_chunk_embeddings TO vault_app;
GRANT UPDATE (
  document_id,
  version_id,
  model_route,
  model_tier,
  embedding,
  embedding_hash,
  source_text_hash,
  stale,
  updated_at
) ON document_chunk_embeddings TO vault_app;

-- Down Migration

REVOKE UPDATE (
  matter_id,
  client_id,
  document_type,
  document_status,
  version_status,
  title,
  content_text,
  fts_config,
  source_text_hash,
  indexed_at,
  updated_at
) ON document_search_index FROM vault_app;

REVOKE UPDATE (
  document_id,
  parent_chunk_id,
  chunk_kind,
  char_start,
  char_end,
  token_count,
  chunk_text,
  text_hash,
  source_text_hash,
  stale,
  updated_at
) ON document_chunks FROM vault_app;

REVOKE UPDATE (
  document_id,
  version_id,
  model_route,
  model_tier,
  embedding,
  embedding_hash,
  source_text_hash,
  stale,
  updated_at
) ON document_chunk_embeddings FROM vault_app;
