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
    SELECT 'CLAUSE_BANK_CHANGED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE clause_bank_entries (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source_clause_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  clause_kind text NOT NULL CHECK (clause_kind IN ('article', 'section', 'paragraph', 'definition')),
  clause_number text NOT NULL CHECK (char_length(clause_number) BETWEEN 1 AND 80),
  heading_hash char(64) NOT NULL CHECK (heading_hash ~ '^[0-9a-f]{64}$'),
  text_hash char(64) NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(tags) <= 12),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  proposed_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_id),
  UNIQUE (tenant_id, source_clause_id),
  CONSTRAINT fk_clause_bank_entries_source_clause
    FOREIGN KEY (tenant_id, source_clause_id)
    REFERENCES contract_clauses (tenant_id, clause_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_clause_bank_entries_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_clause_bank_entries_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_clause_bank_entries_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_clause_bank_entries_proposed_by
    FOREIGN KEY (tenant_id, proposed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_clause_bank_entries_approved_by
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT clause_bank_entries_approved_by_check
    CHECK ((status = 'approved' AND approved_by IS NOT NULL) OR status <> 'approved')
);

CREATE INDEX idx_clause_bank_entries_tenant_status
  ON clause_bank_entries (tenant_id, status, clause_kind, updated_at DESC);

CREATE INDEX idx_clause_bank_entries_tenant_tags
  ON clause_bank_entries USING gin (tags);

ALTER TABLE clause_bank_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_bank_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_clause_bank_entries_tenant ON clause_bank_entries
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON clause_bank_entries TO vault_app;
GRANT UPDATE (
  status,
  tags,
  usage_count,
  approved_by,
  updated_at
) ON clause_bank_entries TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS clause_bank_entries;

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
      AND (
        match[1] <> 'CLAUSE_BANK_CHANGED'
        OR EXISTS (
          SELECT 1
          FROM audit_events ae
          WHERE ae.action = match[1]
          LIMIT 1
        )
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
