-- Up Migration

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  parent_chunk_id uuid,
  chunk_kind text NOT NULL CHECK (chunk_kind IN ('parent', 'child')),
  chunk_ordinal integer NOT NULL CHECK (chunk_ordinal >= 0),
  char_start integer NOT NULL CHECK (char_start >= 0),
  char_end integer NOT NULL CHECK (char_end > char_start),
  token_count integer NOT NULL CHECK (token_count BETWEEN 1 AND 1200),
  chunk_text text NOT NULL CHECK (
    char_length(chunk_text) BETWEEN 1 AND 4000
    AND octet_length(chunk_text) <= 16000
  ),
  text_hash char(64) NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  source_text_hash char(64) NOT NULL CHECK (source_text_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chunk_id),
  UNIQUE (tenant_id, version_id, chunk_ordinal),
  CONSTRAINT fk_document_chunks_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_chunks_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_chunks_parent
    FOREIGN KEY (tenant_id, parent_chunk_id)
    REFERENCES document_chunks (tenant_id, chunk_id)
    ON DELETE RESTRICT,
  CHECK (
    (chunk_kind = 'parent' AND parent_chunk_id IS NULL)
    OR (chunk_kind = 'child' AND parent_chunk_id IS NOT NULL)
  )
);

CREATE INDEX idx_document_chunks_tenant_version
  ON document_chunks (tenant_id, version_id, stale, chunk_kind, chunk_ordinal);

CREATE INDEX idx_document_chunks_tenant_document
  ON document_chunks (tenant_id, document_id, stale, chunk_ordinal);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_chunks_tenant ON document_chunks
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_chunks TO vault_app;
GRANT UPDATE (
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

CREATE TABLE document_chunk_embeddings (
  embedding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  chunk_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  model_route text NOT NULL DEFAULT 'local_gemma' CHECK (model_route = 'local_gemma'),
  model_tier text NOT NULL DEFAULT 'local' CHECK (model_tier = 'local'),
  embedding vector(16) NOT NULL,
  embedding_hash char(64) NOT NULL CHECK (embedding_hash ~ '^[0-9a-f]{64}$'),
  source_text_hash char(64) NOT NULL CHECK (source_text_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, embedding_id),
  UNIQUE (tenant_id, chunk_id, model_route),
  CONSTRAINT fk_document_chunk_embeddings_chunk
    FOREIGN KEY (tenant_id, chunk_id)
    REFERENCES document_chunks (tenant_id, chunk_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_chunk_embeddings_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_chunk_embeddings_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_chunk_embeddings_tenant_version
  ON document_chunk_embeddings (tenant_id, version_id, stale, model_route);

CREATE INDEX idx_document_chunk_embeddings_tenant_chunk
  ON document_chunk_embeddings (tenant_id, chunk_id, stale, model_route);

ALTER TABLE document_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunk_embeddings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_chunk_embeddings_tenant ON document_chunk_embeddings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

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

COMMENT ON TABLE document_chunks IS
  'R6 bounded parent/child chunks derived from canonical document text. Chunk text is capped and must not be copied to audit metadata or logs.';

COMMENT ON TABLE document_chunk_embeddings IS
  'R6 pgvector index table for local deterministic embeddings only. External model embeddings remain blocked by DEC-11.';

COMMENT ON COLUMN document_chunk_embeddings.embedding IS
  '16 dimension local deterministic vector used for R6 retrieval tests and local-only semantic search.';

-- Down Migration

DROP TABLE IF EXISTS document_chunk_embeddings;
DROP TABLE IF EXISTS document_chunks;
DROP EXTENSION IF EXISTS vector;
