-- Up Migration

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE contract_clause_embeddings (
  embedding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  clause_id uuid NOT NULL,
  clause_chunk_id uuid,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  model_route text NOT NULL DEFAULT 'bge_m3' CHECK (model_route = 'bge_m3'),
  model_tier text NOT NULL DEFAULT 'local' CHECK (model_tier = 'local'),
  embedding vector(1024) NOT NULL,
  embedding_hash char(64) NOT NULL CHECK (embedding_hash ~ '^[0-9a-f]{64}$'),
  source_text_hash char(64) NOT NULL CHECK (source_text_hash ~ '^[0-9a-f]{64}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, embedding_id),
  UNIQUE (tenant_id, clause_id, model_route),
  CONSTRAINT fk_contract_clause_embeddings_clause
    FOREIGN KEY (tenant_id, clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_embeddings_clause_chunk
    FOREIGN KEY (tenant_id, clause_chunk_id)
    REFERENCES contract_clause_chunks (tenant_id, clause_chunk_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_embeddings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_embeddings_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_contract_clause_embeddings_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_contract_clause_embeddings_tenant_version
  ON contract_clause_embeddings (tenant_id, version_id, stale, model_route);

SET LOCAL maintenance_work_mem = '16MB';

CREATE INDEX idx_contract_clause_embeddings_bge_m3_hnsw
  ON contract_clause_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE model_route = 'bge_m3' AND stale = false;

ALTER TABLE contract_clause_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_clause_embeddings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_contract_clause_embeddings_tenant ON contract_clause_embeddings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON contract_clause_embeddings TO vault_app;
GRANT UPDATE (
  clause_chunk_id,
  matter_id,
  document_id,
  version_id,
  model_route,
  model_tier,
  embedding,
  embedding_hash,
  source_text_hash,
  stale,
  updated_at
) ON contract_clause_embeddings TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS contract_clause_embeddings;
