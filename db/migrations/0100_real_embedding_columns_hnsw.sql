-- Up Migration

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE document_chunk_embeddings
  DROP CONSTRAINT IF EXISTS document_chunk_embeddings_model_route_check;

ALTER TABLE document_chunk_embeddings
  ALTER COLUMN model_route SET DEFAULT 'bge_m3';

UPDATE document_chunk_embeddings
SET
  stale = true,
  embedding_hash = repeat('0', 64),
  updated_at = now();

ALTER TABLE document_chunk_embeddings
  ALTER COLUMN embedding TYPE vector(1024)
  USING (array_fill(0::real, ARRAY[1024])::vector(1024));

ALTER TABLE document_chunk_embeddings
  ADD CONSTRAINT document_chunk_embeddings_model_route_check
  CHECK (model_route IN ('local_gemma', 'bge_m3'));

SET LOCAL maintenance_work_mem = '16MB';

CREATE INDEX idx_document_chunk_embeddings_bge_m3_hnsw
  ON document_chunk_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE model_route = 'bge_m3' AND stale = false;

COMMENT ON TABLE document_chunk_embeddings IS
  'R6/Retrieval embedding table. New D2 indexing writes local Ollama bge-m3 1024-dimension embeddings; stale rows are ignored by retrieval.';

COMMENT ON COLUMN document_chunk_embeddings.embedding IS
  '1024 dimension pgvector value for local-only bge-m3 embeddings. External embedding APIs remain blocked.';

-- Down Migration

DROP INDEX IF EXISTS idx_document_chunk_embeddings_bge_m3_hnsw;

ALTER TABLE document_chunk_embeddings
  DROP CONSTRAINT IF EXISTS document_chunk_embeddings_model_route_check;

UPDATE document_chunk_embeddings
SET
  model_route = 'local_gemma',
  stale = true,
  embedding_hash = repeat('0', 64),
  updated_at = now();

ALTER TABLE document_chunk_embeddings
  ALTER COLUMN embedding TYPE vector(16)
  USING (array_fill(0::real, ARRAY[16])::vector(16));

ALTER TABLE document_chunk_embeddings
  ALTER COLUMN model_route SET DEFAULT 'local_gemma';

ALTER TABLE document_chunk_embeddings
  ADD CONSTRAINT document_chunk_embeddings_model_route_check CHECK (model_route = 'local_gemma');

COMMENT ON TABLE document_chunk_embeddings IS
  'R6 pgvector index table for local deterministic embeddings only. External model embeddings remain blocked by DEC-11.';

COMMENT ON COLUMN document_chunk_embeddings.embedding IS
  '16 dimension local deterministic vector used for R6 retrieval tests and local-only semantic search.';
