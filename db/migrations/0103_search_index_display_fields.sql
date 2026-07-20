-- Up Migration

ALTER TABLE document_search_index
  ADD COLUMN author_user_id uuid,
  ADD COLUMN ai_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN prev_version_id uuid,
  ADD COLUMN next_version_id uuid,
  ADD CONSTRAINT fk_document_search_index_author_user
    FOREIGN KEY (tenant_id, author_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_document_search_index_prev_version
    FOREIGN KEY (tenant_id, prev_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_document_search_index_next_version
    FOREIGN KEY (tenant_id, next_version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT;

UPDATE document_search_index idx
SET author_user_id = dv.created_by,
    ai_allowed = d.ai_allowed,
    prev_version_id = dv.supersedes_version_id,
    next_version_id = (
      SELECT next_dv.version_id
      FROM document_versions next_dv
      WHERE next_dv.tenant_id = dv.tenant_id
        AND next_dv.document_id = dv.document_id
        AND next_dv.supersedes_version_id = dv.version_id
      ORDER BY next_dv.version_no ASC, next_dv.created_at ASC, next_dv.version_id ASC
      LIMIT 1
    ),
    updated_at = now()
FROM document_versions dv
JOIN documents d
  ON d.tenant_id = dv.tenant_id
  AND d.document_id = dv.document_id
WHERE idx.tenant_id = dv.tenant_id
  AND idx.version_id = dv.version_id;

ALTER TABLE document_search_index
  ALTER COLUMN author_user_id SET NOT NULL;

CREATE INDEX idx_document_search_index_tenant_author
  ON document_search_index (tenant_id, author_user_id, updated_at DESC);

CREATE INDEX idx_document_search_index_tenant_ai_allowed
  ON document_search_index (tenant_id, ai_allowed, version_status)
  WHERE ai_allowed = true;

GRANT UPDATE (
  author_user_id,
  ai_allowed,
  prev_version_id,
  next_version_id,
  updated_at
) ON document_search_index TO vault_app;

COMMENT ON COLUMN document_search_index.author_user_id IS
  'Document version author reference for search result display. Reference ID only; no body or raw content.';

COMMENT ON COLUMN document_search_index.ai_allowed IS
  'Denormalized document AI eligibility flag for search result display only. AI actions still require permission-before-AI checks.';

COMMENT ON COLUMN document_search_index.prev_version_id IS
  'Previous version reference for bounded search result navigation.';

COMMENT ON COLUMN document_search_index.next_version_id IS
  'Next version reference for bounded search result navigation.';

-- Down Migration

DROP INDEX IF EXISTS idx_document_search_index_tenant_ai_allowed;
DROP INDEX IF EXISTS idx_document_search_index_tenant_author;

ALTER TABLE document_search_index
  DROP CONSTRAINT IF EXISTS fk_document_search_index_next_version,
  DROP CONSTRAINT IF EXISTS fk_document_search_index_prev_version,
  DROP CONSTRAINT IF EXISTS fk_document_search_index_author_user,
  DROP COLUMN IF EXISTS next_version_id,
  DROP COLUMN IF EXISTS prev_version_id,
  DROP COLUMN IF EXISTS ai_allowed,
  DROP COLUMN IF EXISTS author_user_id;
