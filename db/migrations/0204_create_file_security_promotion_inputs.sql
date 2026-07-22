-- Up Migration

CREATE TABLE file_security_promotion_inputs (
  scan_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 1000),
  normalized_filename text NOT NULL CHECK (char_length(normalized_filename) BETWEEN 1 AND 1000),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 255),
  source_system text NOT NULL CHECK (source_system IN ('upload', 'email_ingest', 'migration')),
  created_by uuid NOT NULL,
  fields_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scan_id),
  CONSTRAINT fk_file_security_promotion_inputs_scan
    FOREIGN KEY (tenant_id, scan_id)
    REFERENCES file_security_scans(tenant_id, scan_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_promotion_inputs_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE file_security_promotions (
  scan_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  file_object_id uuid NOT NULL,
  primary_sha256 char(64) NOT NULL CHECK (primary_sha256 ~ '^[a-f0-9]{64}$'),
  promoted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scan_id),
  UNIQUE (tenant_id, document_id),
  UNIQUE (tenant_id, version_id),
  UNIQUE (tenant_id, file_object_id),
  CONSTRAINT fk_file_security_promotions_scan
    FOREIGN KEY (tenant_id, scan_id)
    REFERENCES file_security_scans(tenant_id, scan_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_promotions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents(tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_promotions_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions(tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_promotions_file_object
    FOREIGN KEY (tenant_id, file_object_id)
    REFERENCES file_objects(tenant_id, file_object_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_promotions_promoted_by
    FOREIGN KEY (tenant_id, promoted_by)
    REFERENCES users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION app_reject_file_security_promotion_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'file security promotion receipts are append-only';
END;
$$;

CREATE TRIGGER trg_file_security_promotion_inputs_immutable
BEFORE UPDATE OR DELETE ON file_security_promotion_inputs
FOR EACH ROW EXECUTE FUNCTION app_reject_file_security_promotion_receipt_mutation();

CREATE TRIGGER trg_file_security_promotions_immutable
BEFORE UPDATE OR DELETE ON file_security_promotions
FOR EACH ROW EXECUTE FUNCTION app_reject_file_security_promotion_receipt_mutation();

ALTER TABLE file_security_promotion_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_security_promotion_inputs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_file_security_promotion_inputs_tenant ON file_security_promotion_inputs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE file_security_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_security_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_file_security_promotions_tenant ON file_security_promotions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON file_security_promotion_inputs TO vault_app;
GRANT SELECT, INSERT ON file_security_promotions TO vault_app;

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
    SELECT 'FILE_PROMOTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action = 'FILE_PROMOTED'
    LIMIT 1
  ) OR EXISTS (SELECT 1 FROM file_security_promotions LIMIT 1)
    OR EXISTS (SELECT 1 FROM file_security_promotion_inputs LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot remove file security promotion receipts while evidence exists';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> 'FILE_PROMOTED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS file_security_promotions;
DROP TABLE IF EXISTS file_security_promotion_inputs;
DROP FUNCTION IF EXISTS app_reject_file_security_promotion_receipt_mutation();
