-- Up Migration

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE contract_clause_chunks
  ADD COLUMN chunk_text text NOT NULL DEFAULT '',
  ADD COLUMN chunk_search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED;

UPDATE contract_clause_chunks ccc
SET chunk_text = substring(
    cd.body_text
    FROM ccc.start_offset + 1
    FOR GREATEST(ccc.end_offset - ccc.start_offset, 0)
  )
FROM canonical_documents cd
WHERE cd.tenant_id = ccc.tenant_id
  AND cd.version_id = ccc.version_id
  AND ccc.chunk_text = ''
  AND cd.body_text IS NOT NULL;

CREATE INDEX idx_contract_clause_chunks_search_tsv
  ON contract_clause_chunks USING gin (chunk_search_tsv)
  WHERE stale = false;

CREATE INDEX idx_contract_clause_chunks_search_korean_ngram
  ON contract_clause_chunks USING gin (amic_korean_search_normalize(chunk_text) gin_trgm_ops)
  WHERE stale = false;

GRANT UPDATE (
  chunk_text
) ON contract_clause_chunks TO vault_app;

COMMENT ON COLUMN contract_clause_chunks.chunk_text IS
  'D11 clause-local search text derived from canonical document offsets; do not store document body outside this bounded clause span.';

-- Down Migration

DROP INDEX IF EXISTS idx_contract_clause_chunks_search_korean_ngram;
DROP INDEX IF EXISTS idx_contract_clause_chunks_search_tsv;

ALTER TABLE contract_clause_chunks
  DROP COLUMN IF EXISTS chunk_search_tsv,
  DROP COLUMN IF EXISTS chunk_text;
