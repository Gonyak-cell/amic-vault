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
    SELECT 'DOCUMENT_REVISIONS_EXTRACTED'
    UNION
    SELECT 'DOCUMENT_ANNOTATIONS_EXTRACTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE document_revisions (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  subversion_id uuid,
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  change_type text NOT NULL CHECK (change_type IN ('insert', 'delete', 'move_from', 'move_to', 'format')),
  author_label text CHECK (
    author_label IS NULL OR (
      char_length(author_label) BETWEEN 1 AND 160
      AND author_label !~* '(password|secret|token)'
    )
  ),
  changed_at timestamptz,
  before_text text NOT NULL DEFAULT '' CHECK (char_length(before_text) <= 16000),
  after_text text NOT NULL DEFAULT '' CHECK (char_length(after_text) <= 16000),
  before_text_hash char(64) NOT NULL CHECK (before_text_hash ~ '^[0-9a-f]{64}$'),
  after_text_hash char(64) NOT NULL CHECK (after_text_hash ~ '^[0-9a-f]{64}$'),
  parser_version text NOT NULL CHECK (parser_version ~ '^b10-[a-z0-9.-]{1,32}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, revision_id),
  CONSTRAINT fk_document_revisions_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_revisions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_revisions_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_revisions_subversion
    FOREIGN KEY (tenant_id, subversion_id)
    REFERENCES document_subversions (tenant_id, subversion_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_revisions_tenant_version
  ON document_revisions (tenant_id, version_id, stale, sequence_no);

CREATE INDEX idx_document_revisions_tenant_subversion
  ON document_revisions (tenant_id, subversion_id, sequence_no)
  WHERE subversion_id IS NOT NULL;

CREATE UNIQUE INDEX idx_document_revisions_current_version_sequence
  ON document_revisions (tenant_id, version_id, sequence_no, parser_version)
  WHERE subversion_id IS NULL AND stale = false;

CREATE UNIQUE INDEX idx_document_revisions_current_subversion_sequence
  ON document_revisions (tenant_id, subversion_id, sequence_no, parser_version)
  WHERE subversion_id IS NOT NULL AND stale = false;

ALTER TABLE document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_revisions_tenant ON document_revisions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_revisions TO vault_app;
GRANT UPDATE (
  sequence_no,
  change_type,
  author_label,
  changed_at,
  before_text,
  after_text,
  before_text_hash,
  after_text_hash,
  parser_version,
  stale,
  updated_at
) ON document_revisions TO vault_app;

CREATE TABLE document_annotations (
  annotation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  subversion_id uuid,
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  annotation_type text NOT NULL CHECK (
    annotation_type IN (
      'highlight',
      'text',
      'freetext',
      'underline',
      'squiggly',
      'strikeout',
      'line',
      'square',
      'circle',
      'polygon',
      'polyline',
      'ink',
      'stamp',
      'popup',
      'link',
      'unknown'
    )
  ),
  page_number integer NOT NULL CHECK (page_number >= 1),
  author_label text CHECK (
    author_label IS NULL OR (
      char_length(author_label) BETWEEN 1 AND 160
      AND author_label !~* '(password|secret|token)'
    )
  ),
  contents text NOT NULL DEFAULT '' CHECK (char_length(contents) <= 16000),
  contents_hash char(64) NOT NULL CHECK (contents_hash ~ '^[0-9a-f]{64}$'),
  rect numeric[] NOT NULL DEFAULT ARRAY[]::numeric[] CHECK (cardinality(rect) IN (0, 4)),
  parser_version text NOT NULL CHECK (parser_version ~ '^b10-[a-z0-9.-]{1,32}$'),
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, annotation_id),
  CONSTRAINT fk_document_annotations_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_annotations_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_annotations_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_document_annotations_subversion
    FOREIGN KEY (tenant_id, subversion_id)
    REFERENCES document_subversions (tenant_id, subversion_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_document_annotations_tenant_version
  ON document_annotations (tenant_id, version_id, stale, page_number, sequence_no);

CREATE INDEX idx_document_annotations_tenant_subversion
  ON document_annotations (tenant_id, subversion_id, page_number, sequence_no)
  WHERE subversion_id IS NOT NULL;

CREATE UNIQUE INDEX idx_document_annotations_current_version_sequence
  ON document_annotations (tenant_id, version_id, sequence_no, parser_version)
  WHERE subversion_id IS NULL AND stale = false;

CREATE UNIQUE INDEX idx_document_annotations_current_subversion_sequence
  ON document_annotations (tenant_id, subversion_id, sequence_no, parser_version)
  WHERE subversion_id IS NOT NULL AND stale = false;

ALTER TABLE document_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_annotations FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_annotations_tenant ON document_annotations
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_annotations TO vault_app;
GRANT UPDATE (
  sequence_no,
  annotation_type,
  page_number,
  author_label,
  contents,
  contents_hash,
  rect,
  parser_version,
  stale,
  updated_at
) ON document_annotations TO vault_app;

COMMENT ON TABLE document_revisions IS
  'B10 DOCX Track Changes extraction. Rows inherit document permissions and may contain bounded markup text; audit metadata must reference IDs and hashes only.';

COMMENT ON TABLE document_annotations IS
  'B10 PDF annotation extraction. Rows inherit document permissions and may contain bounded annotation text; audit metadata must reference IDs and hashes only.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (SELECT 1 FROM document_revisions LIMIT 1)
     OR EXISTS (SELECT 1 FROM document_annotations LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot drop B10 document revision/annotation rows once extracted markup data exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN ('DOCUMENT_REVISIONS_EXTRACTED', 'DOCUMENT_ANNOTATIONS_EXTRACTED')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove B10 document markup audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] NOT IN ('DOCUMENT_REVISIONS_EXTRACTED', 'DOCUMENT_ANNOTATIONS_EXTRACTED')
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS document_annotations;
DROP TABLE IF EXISTS document_revisions;
