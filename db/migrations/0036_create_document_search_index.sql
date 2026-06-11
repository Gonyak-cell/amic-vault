-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED'
    )
  );

CREATE TABLE document_search_index (
  index_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  client_id uuid NOT NULL,
  document_type text NOT NULL,
  document_status text NOT NULL,
  version_status text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 1000),
  content_text text NOT NULL DEFAULT '' CHECK (octet_length(content_text) <= 1048576),
  title_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', title)) STORED,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content_text)) STORED,
  fts_config text NOT NULL DEFAULT 'simple' CHECK (fts_config = 'simple'),
  source_text_hash char(64) NOT NULL CHECK (source_text_hash ~ '^[0-9a-f]{64}$'),
  indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, index_id),
  UNIQUE (tenant_id, version_id),
  CONSTRAINT fk_document_search_index_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_search_index_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_search_index_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_search_index_client
    FOREIGN KEY (tenant_id, client_id)
    REFERENCES clients (tenant_id, client_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_search_index_tenant_document
  ON document_search_index (tenant_id, document_id, version_status, indexed_at DESC);

CREATE INDEX idx_document_search_index_tenant_matter
  ON document_search_index (tenant_id, matter_id, version_status, indexed_at DESC);

CREATE INDEX idx_document_search_index_tenant_client
  ON document_search_index (tenant_id, client_id, version_status, indexed_at DESC);

CREATE INDEX idx_document_search_index_title_tsv
  ON document_search_index USING gin (title_tsv);

CREATE INDEX idx_document_search_index_content_tsv
  ON document_search_index USING gin (content_tsv);

ALTER TABLE document_search_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_search_index FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_search_index_tenant ON document_search_index
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

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

COMMENT ON TABLE document_search_index IS
  'R3 PostgreSQL FTS index for permission-bound search. content_text is stored for indexing only and must never be copied to logs or audit metadata.';

COMMENT ON COLUMN document_search_index.fts_config IS
  'R3 starts with PostgreSQL simple config. Korean quality is measured in PACK-R3-03 before any OpenSearch transition decision.';

-- Down Migration

DROP TABLE IF EXISTS document_search_index;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R3 reindex audit rows have been recorded,
-- rollback cannot safely remove SEARCH_REINDEX_REQUESTED from the allow-list.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED'
    )
  );
