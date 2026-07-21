-- Up Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
    UNION
    SELECT 'WIKI_PAGE_PROPOSED'
    UNION
    SELECT 'WIKI_PAGE_REVIEWED'
    UNION
    SELECT 'WIKI_EXPORTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE matter_wiki_pages (
  page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  page_kind text NOT NULL CHECK (page_kind IN ('overview', 'issue', 'party', 'timeline')),
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 240
    AND title !~* '(password|secret|token)'
  ),
  markdown_body text NOT NULL CHECK (
    char_length(markdown_body) BETWEEN 1 AND 20000
    AND markdown_body !~* '(password|secret|token)'
  ),
  source_refs jsonb NOT NULL CHECK (
    jsonb_typeof(source_refs) = 'array'
    AND jsonb_array_length(source_refs) BETWEEN 1 AND 50
    AND source_refs::text !~* '(body|content|snippet|raw|password|secret|token)'
  ),
  provenance text NOT NULL DEFAULT 'ai_proposed' CHECK (
    provenance IN ('derived', 'ai_proposed', 'human_confirmed')
  ),
  review_status text NOT NULL DEFAULT 'proposed' CHECK (
    review_status IN ('proposed', 'confirmed', 'rejected')
  ),
  generated_by uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text CHECK (
    review_reason IS NULL
    OR (
      char_length(review_reason) BETWEEN 8 AND 500
      AND review_reason !~ '[[:cntrl:]]'
      AND review_reason !~* '(password|secret|token)'
    )
  ),
  work_item_id uuid,
  created_audit_event_id uuid,
  last_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, page_id),
  UNIQUE (tenant_id, matter_id, page_kind),
  CONSTRAINT fk_matter_wiki_pages_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_wiki_pages_generated_by
    FOREIGN KEY (tenant_id, generated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_wiki_pages_reviewed_by
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT matter_wiki_pages_review_consistency CHECK (
    (
      review_status = 'proposed'
      AND provenance = 'ai_proposed'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND review_reason IS NULL
    )
    OR (
      review_status IN ('confirmed', 'rejected')
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL
    )
  )
);

CREATE INDEX idx_matter_wiki_pages_tenant_matter
  ON matter_wiki_pages (tenant_id, matter_id, review_status, page_kind);

CREATE INDEX idx_matter_wiki_pages_tenant_updated
  ON matter_wiki_pages (tenant_id, updated_at DESC, page_id);

ALTER TABLE matter_wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_wiki_pages FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_wiki_pages_tenant ON matter_wiki_pages
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON matter_wiki_pages TO vault_app;
GRANT UPDATE (
  title,
  markdown_body,
  source_refs,
  provenance,
  review_status,
  reviewed_by,
  reviewed_at,
  review_reason,
  work_item_id,
  created_audit_event_id,
  last_audit_event_id,
  updated_at
) ON matter_wiki_pages TO vault_app;

DO $$
DECLARE
  kind_values text[];
  kind_list text;
  target_values text[];
  target_list text;
BEGIN
  SELECT array_agg(kind_name ORDER BY kind_name)
  INTO kind_values
  FROM (
    SELECT DISTINCT match[1] AS kind_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_kind_check'
    UNION
    SELECT 'wiki_page_review'
  ) kinds;

  SELECT string_agg(quote_literal(kind_name), ', ')
  INTO kind_list
  FROM unnest(kind_values) AS values(kind_name);

  SELECT array_agg(target_name ORDER BY target_name)
  INTO target_values
  FROM (
    SELECT DISTINCT match[1] AS target_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_target_type_check'
    UNION
    SELECT 'matter_wiki_page'
  ) targets;

  SELECT string_agg(quote_literal(target_name), ', ')
  INTO target_list
  FROM unnest(target_values) AS values(target_name);

  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_kind_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_kind_check CHECK (kind = ANY (ARRAY[' || kind_list || ']::text[]))';
  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_target_type_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_target_type_check CHECK (target_type = ANY (ARRAY[' || target_list || ']::text[]))';
END $$;

COMMENT ON TABLE matter_wiki_pages IS
  'Tenant-scoped Matter wiki draft/review pages. Markdown may contain derived work product; source_refs must remain bounded citation references only.';
COMMENT ON COLUMN matter_wiki_pages.source_refs IS
  'Bounded citation/source references for the generated wiki page. Do not store raw document text, snippets, prompts, or model payloads.';
COMMENT ON COLUMN work_items.kind IS
  'DMS work kind. wiki_page_review rows point at matter_wiki_pages and are completed by the Matter wiki review API.';

-- Down Migration

DELETE FROM work_items
WHERE kind = 'wiki_page_review'
   OR target_type = 'matter_wiki_page';

DROP TABLE IF EXISTS matter_wiki_pages;

DO $$
DECLARE
  kind_values text[];
  kind_list text;
  target_values text[];
  target_list text;
BEGIN
  SELECT array_agg(kind_name ORDER BY kind_name)
  INTO kind_values
  FROM (
    SELECT DISTINCT match[1] AS kind_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_kind_check'
      AND match[1] <> 'wiki_page_review'
  ) kinds;

  SELECT string_agg(quote_literal(kind_name), ', ')
  INTO kind_list
  FROM unnest(kind_values) AS values(kind_name);

  SELECT array_agg(target_name ORDER BY target_name)
  INTO target_values
  FROM (
    SELECT DISTINCT match[1] AS target_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'work_items'::regclass
      AND c.conname = 'work_items_target_type_check'
      AND match[1] <> 'matter_wiki_page'
  ) targets;

  SELECT string_agg(quote_literal(target_name), ', ')
  INTO target_list
  FROM unnest(target_values) AS values(target_name);

  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_kind_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_kind_check CHECK (kind = ANY (ARRAY[' || kind_list || ']::text[]))';
  EXECUTE 'ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_target_type_check';
  EXECUTE 'ALTER TABLE work_items ADD CONSTRAINT work_items_target_type_check CHECK (target_type = ANY (ARRAY[' || target_list || ']::text[]))';
END $$;

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN ('WIKI_PAGE_PROPOSED', 'WIKI_PAGE_REVIEWED', 'WIKI_EXPORTED')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove Matter wiki audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] NOT IN ('WIKI_PAGE_PROPOSED', 'WIKI_PAGE_REVIEWED', 'WIKI_EXPORTED')
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
