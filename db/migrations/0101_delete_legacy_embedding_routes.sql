-- Up Migration

DELETE FROM document_chunk_embeddings
WHERE model_route <> 'bge_m3';

COMMENT ON TABLE document_chunk_embeddings IS
  'D3 backfilled embedding table. Active rows use local Ollama bge-m3 1024-dimension embeddings; stale rows are excluded from retrieval.';

-- Down Migration

COMMENT ON TABLE document_chunk_embeddings IS
  'R6/Retrieval embedding table. New D2 indexing writes local Ollama bge-m3 1024-dimension embeddings; stale rows are ignored by retrieval.';
