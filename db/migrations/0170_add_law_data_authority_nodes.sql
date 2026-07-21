-- Up Migration

CREATE TABLE external_authorities (
  authority_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('law_statute')),
  external_ref text NOT NULL CHECK (char_length(external_ref) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  citation text NOT NULL CHECK (char_length(citation) BETWEEN 1 AND 500),
  source_url text NOT NULL CHECK (char_length(source_url) BETWEEN 1 AND 1000),
  search_text text NOT NULL CHECK (char_length(search_text) BETWEEN 1 AND 4000),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, external_ref),
  UNIQUE (tenant_id, authority_id)
);

CREATE INDEX idx_external_authorities_tenant_search
  ON external_authorities USING gin (search_vector);

ALTER TABLE external_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_authorities FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_external_authorities_tenant ON external_authorities
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON external_authorities TO vault_app;
GRANT UPDATE (
  title,
  citation,
  source_url,
  search_text,
  payload_json,
  fetched_at,
  updated_at
) ON external_authorities TO vault_app;

CREATE TABLE law_data_dart_filing_cache (
  cache_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  cache_key char(64) NOT NULL CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  corp_code char(8) NOT NULL CHECK (corp_code ~ '^[0-9]{8}$'),
  filings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cache_key)
);

ALTER TABLE law_data_dart_filing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE law_data_dart_filing_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_law_data_dart_filing_cache_tenant ON law_data_dart_filing_cache
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON law_data_dart_filing_cache TO vault_app;
GRANT UPDATE (
  corp_code,
  filings_json,
  fetched_at,
  updated_at
) ON law_data_dart_filing_cache TO vault_app;

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_node_type_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_scope_shape_check;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN (
      'client',
      'matter',
      'document',
      'version',
      'text_chunk',
      'clause',
      'defined_term',
      'fact',
      'evidence',
      'issue',
      'risk',
      'rfi',
      'party',
      'negotiation_position',
      'authority'
    )
  ),
  ADD CONSTRAINT graph_nodes_source_table_check CHECK (
    source_table IN (
      'clients',
      'matters',
      'documents',
      'document_versions',
      'document_chunks',
      'contract_clauses',
      'contract_defined_terms',
      'litigation_facts',
      'litigation_evidence_items',
      'litigation_issue_nodes',
      'dd_issues',
      'dd_risks',
      'dd_rfis',
      'parties',
      'ai_claims',
      'negotiation_positions',
      'external_authorities'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (
      node_type IN ('version', 'text_chunk', 'clause', 'defined_term')
      AND matter_id IS NOT NULL
      AND document_id IS NOT NULL
      AND version_id IS NOT NULL
    )
    OR (
      node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party', 'negotiation_position')
      AND matter_id IS NOT NULL
    )
    OR (node_type = 'authority' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
  );

-- Down Migration

DELETE FROM graph_nodes
WHERE node_type = 'authority'
  AND source_table = 'external_authorities';

DROP TABLE IF EXISTS law_data_dart_filing_cache;
DROP TABLE IF EXISTS external_authorities;

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_node_type_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_source_table_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_scope_shape_check;

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_node_type_check CHECK (
    node_type IN (
      'client',
      'matter',
      'document',
      'version',
      'text_chunk',
      'clause',
      'defined_term',
      'fact',
      'evidence',
      'issue',
      'risk',
      'rfi',
      'party',
      'negotiation_position'
    )
  ),
  ADD CONSTRAINT graph_nodes_source_table_check CHECK (
    source_table IN (
      'clients',
      'matters',
      'documents',
      'document_versions',
      'document_chunks',
      'contract_clauses',
      'contract_defined_terms',
      'litigation_facts',
      'litigation_evidence_items',
      'litigation_issue_nodes',
      'dd_issues',
      'dd_risks',
      'dd_rfis',
      'parties',
      'ai_claims',
      'negotiation_positions'
    )
  ),
  ADD CONSTRAINT graph_nodes_scope_shape_check CHECK (
    (node_type = 'client' AND matter_id IS NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'matter' AND matter_id IS NOT NULL AND document_id IS NULL AND version_id IS NULL)
    OR (node_type = 'document' AND matter_id IS NOT NULL AND document_id IS NOT NULL AND version_id IS NULL)
    OR (
      node_type IN ('version', 'text_chunk', 'clause', 'defined_term')
      AND matter_id IS NOT NULL
      AND document_id IS NOT NULL
      AND version_id IS NOT NULL
    )
    OR (
      node_type IN ('fact', 'evidence', 'issue', 'risk', 'rfi', 'party', 'negotiation_position')
      AND matter_id IS NOT NULL
    )
  );
