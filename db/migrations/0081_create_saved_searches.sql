-- Up Migration

CREATE TABLE saved_searches (
  saved_search_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  search_query_json jsonb NOT NULL,
  query_hash char(64) NOT NULL CHECK (query_hash ~ '^[0-9a-f]{64}$'),
  filter_refs text NOT NULL DEFAULT 'none' CHECK (char_length(filter_refs) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, saved_search_id),
  UNIQUE (tenant_id, user_id, name),
  CONSTRAINT fk_saved_searches_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_saved_searches_tenant_user_updated
  ON saved_searches (tenant_id, user_id, updated_at DESC, saved_search_id);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_saved_searches_tenant ON saved_searches
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

COMMENT ON TABLE saved_searches IS
  'Per-user saved enterprise search definitions. Stores search request JSON only; snippets, document body, preview text, prompts, and model responses are not stored.';

-- Down Migration

DROP TABLE IF EXISTS saved_searches;
