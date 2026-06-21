-- Up Migration

ALTER TABLE enterprise_dms_taxonomies
  ADD COLUMN version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
  ADD COLUMN last_audit_event_id uuid;

CREATE TABLE enterprise_dms_taxonomy_versions (
  taxonomy_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  taxonomy_id uuid NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  document_type_code text NOT NULL CHECK (document_type_code ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  description text CHECK (
    description IS NULL OR (
      char_length(description) <= 400
      AND description !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|prompt|response|model)'
    )
  ),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  subtypes_json jsonb NOT NULL CHECK (
    jsonb_typeof(subtypes_json) = 'array'
    AND jsonb_array_length(subtypes_json) <= 20
  ),
  metadata_fields_json jsonb NOT NULL CHECK (
    jsonb_typeof(metadata_fields_json) = 'array'
    AND jsonb_array_length(metadata_fields_json) <= 20
  ),
  change_reason text NOT NULL CHECK (change_reason IN ('upsert', 'disable')),
  changed_by uuid NOT NULL,
  audit_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, taxonomy_version_id),
  UNIQUE (tenant_id, taxonomy_id, version_no),
  CONSTRAINT fk_enterprise_dms_taxonomy_versions_taxonomy
    FOREIGN KEY (tenant_id, taxonomy_id)
    REFERENCES enterprise_dms_taxonomies (tenant_id, taxonomy_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_taxonomy_versions_changed_by
    FOREIGN KEY (tenant_id, changed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_dms_taxonomy_versions_tenant_taxonomy
  ON enterprise_dms_taxonomy_versions (tenant_id, taxonomy_id, version_no DESC);

ALTER TABLE enterprise_dms_taxonomy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_dms_taxonomy_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_dms_taxonomy_versions_tenant
  ON enterprise_dms_taxonomy_versions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_dms_taxonomy_versions TO vault_app;
GRANT UPDATE (version_no, last_audit_event_id) ON enterprise_dms_taxonomies TO vault_app;

COMMENT ON COLUMN enterprise_dms_taxonomies.version_no IS
  'Monotonic tenant-admin taxonomy version. Incremented on each upsert or disable.';
COMMENT ON COLUMN enterprise_dms_taxonomies.last_audit_event_id IS
  'Reference-only audit event UUID for the latest taxonomy configuration change; no FK so audit append-only controls stay authoritative.';
COMMENT ON TABLE enterprise_dms_taxonomy_versions IS
  'Versioned tenant DMS taxonomy snapshots. Contains bounded configuration labels only; no document body, snippets, prompts, model responses, or private endpoints.';
COMMENT ON COLUMN enterprise_dms_taxonomy_versions.audit_event_id IS
  'Reference-only audit event UUID for this taxonomy version.';

-- Down Migration

DROP TABLE IF EXISTS enterprise_dms_taxonomy_versions;

ALTER TABLE enterprise_dms_taxonomies
  DROP COLUMN IF EXISTS last_audit_event_id,
  DROP COLUMN IF EXISTS version_no;
