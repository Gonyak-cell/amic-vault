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
    SELECT 'DOCUMENT_FOLDER_CREATED'
    UNION
    SELECT 'DOCUMENT_FOLDER_MOVED'
    UNION
    SELECT 'DOCUMENT_FOLDER_RENAMED'
    UNION
    SELECT 'DOCUMENT_TAGS_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE document_folders (
  folder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  parent_folder_id uuid,
  name text NOT NULL CHECK (
    char_length(name) BETWEEN 1 AND 160
    AND position('/' in name) = 0
    AND position('\\' in name) = 0
    AND name <> '.'
    AND name <> '..'
  ),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, folder_id),
  UNIQUE (tenant_id, matter_id, folder_id),
  CONSTRAINT fk_document_folders_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_folders_parent
    FOREIGN KEY (tenant_id, matter_id, parent_folder_id)
    REFERENCES document_folders (tenant_id, matter_id, folder_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_folders_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (parent_folder_id IS NULL OR parent_folder_id <> folder_id)
);

CREATE UNIQUE INDEX idx_document_folders_root_name
  ON document_folders (tenant_id, matter_id, lower(name))
  WHERE parent_folder_id IS NULL;

CREATE UNIQUE INDEX idx_document_folders_child_name
  ON document_folders (tenant_id, matter_id, parent_folder_id, lower(name))
  WHERE parent_folder_id IS NOT NULL;

CREATE INDEX idx_document_folders_parent
  ON document_folders (tenant_id, matter_id, parent_folder_id, name);

ALTER TABLE documents
  ADD COLUMN folder_id uuid,
  ADD CONSTRAINT fk_documents_folder
    FOREIGN KEY (tenant_id, matter_id, folder_id)
    REFERENCES document_folders (tenant_id, matter_id, folder_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_documents_folder
  ON documents (tenant_id, matter_id, folder_id, updated_at DESC, document_id);

CREATE TABLE document_tags (
  tag_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  tag text NOT NULL CHECK (
    char_length(tag) BETWEEN 1 AND 80
    AND tag !~ '[[:cntrl:]]'
  ),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_id, tag),
  CONSTRAINT fk_document_tags_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_tags_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_document_tags_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_tags_matter_tag
  ON document_tags (tenant_id, matter_id, tag, document_id);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_folders_tenant ON document_folders
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_tags_tenant ON document_tags
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_folders TO vault_app;
GRANT UPDATE (parent_folder_id, name, updated_at) ON document_folders TO vault_app;

GRANT SELECT, INSERT, DELETE ON document_tags TO vault_app;

GRANT UPDATE (folder_id, updated_at) ON documents TO vault_app;

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN (
      'DOCUMENT_FOLDER_CREATED',
      'DOCUMENT_FOLDER_MOVED',
      'DOCUMENT_FOLDER_RENAMED',
      'DOCUMENT_TAGS_CHANGED'
    )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove B8 folder/tag audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] NOT IN (
        'DOCUMENT_FOLDER_CREATED',
        'DOCUMENT_FOLDER_MOVED',
        'DOCUMENT_FOLDER_RENAMED',
        'DOCUMENT_TAGS_CHANGED'
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS document_tags;

DROP INDEX IF EXISTS idx_documents_folder;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS fk_documents_folder,
  DROP COLUMN IF EXISTS folder_id;

DROP TABLE IF EXISTS document_folders;
