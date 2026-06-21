-- Up Migration

ALTER TABLE saved_searches
  ADD COLUMN scope_type text NOT NULL DEFAULT 'personal',
  ADD COLUMN matter_id uuid,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid,
  ADD COLUMN opened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_opened_at timestamptz,
  ADD CONSTRAINT saved_searches_scope_type_check
    CHECK (scope_type IN ('personal', 'matter-team', 'admin-shared')),
  ADD CONSTRAINT saved_searches_matter_team_scope_check
    CHECK (scope_type <> 'matter-team' OR matter_id IS NOT NULL),
  ADD CONSTRAINT saved_searches_opened_count_check
    CHECK (opened_count >= 0),
  ADD CONSTRAINT fk_saved_searches_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_saved_searches_revoked_by
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_saved_searches_visible_scope
  ON saved_searches (tenant_id, scope_type, matter_id, updated_at DESC, saved_search_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_saved_searches_opened
  ON saved_searches (tenant_id, last_opened_at DESC, saved_search_id)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN saved_searches.scope_type IS
  'Governed saved-search folder scope: personal, matter-team, or admin-shared.';

COMMENT ON COLUMN saved_searches.opened_count IS
  'Aggregate-only saved-search folder open count. No snippets, document body, prompt text, or model responses are stored.';

-- Down Migration

DROP INDEX IF EXISTS idx_saved_searches_opened;
DROP INDEX IF EXISTS idx_saved_searches_visible_scope;

ALTER TABLE saved_searches
  DROP CONSTRAINT IF EXISTS fk_saved_searches_revoked_by,
  DROP CONSTRAINT IF EXISTS fk_saved_searches_matter,
  DROP CONSTRAINT IF EXISTS saved_searches_opened_count_check,
  DROP CONSTRAINT IF EXISTS saved_searches_matter_team_scope_check,
  DROP CONSTRAINT IF EXISTS saved_searches_scope_type_check,
  DROP COLUMN IF EXISTS last_opened_at,
  DROP COLUMN IF EXISTS opened_count,
  DROP COLUMN IF EXISTS revoked_by,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS matter_id,
  DROP COLUMN IF EXISTS scope_type;
