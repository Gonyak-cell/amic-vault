-- Up Migration

ALTER TABLE document_search_index
  ADD COLUMN content_truncated boolean NOT NULL DEFAULT false;

CREATE INDEX idx_document_chunks_child_fts
  ON document_chunks
  USING gin (to_tsvector('simple', chunk_text))
  WHERE chunk_kind = 'child' AND stale = false;

CREATE INDEX idx_document_chunks_child_korean_ngram
  ON document_chunks
  USING gin (amic_korean_search_normalize(chunk_text) gin_trgm_ops)
  WHERE chunk_kind = 'child' AND stale = false;

GRANT UPDATE (
  content_truncated,
  updated_at
) ON document_search_index TO vault_app;

COMMENT ON COLUMN document_search_index.content_truncated IS
  'True when content_text is a 1MB preview only; full body search must use permission-scoped document_chunks.';

COMMENT ON INDEX idx_document_chunks_child_fts IS
  'D6 chunk-level FTS for large-document body search after permission-scoped document_search_index filtering.';

COMMENT ON INDEX idx_document_chunks_child_korean_ngram IS
  'D6 chunk-level Korean normalized trigram fallback matching D1 search behavior.';

-- Down Migration

DROP INDEX IF EXISTS idx_document_chunks_child_korean_ngram;
DROP INDEX IF EXISTS idx_document_chunks_child_fts;

ALTER TABLE document_search_index
  DROP COLUMN IF EXISTS content_truncated;
