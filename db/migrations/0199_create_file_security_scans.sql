-- Up Migration

CREATE TABLE file_security_scans (
  scan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  quarantine_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  quarantine_storage_uri text NOT NULL
    CHECK (quarantine_storage_uri ~ '^s3://[^/]+/tenants/[0-9a-f-]{36}/quarantine/[0-9a-f-]{36}$'),
  expected_sha256 char(64) NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  observed_sha256 char(64) CHECK (observed_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  state text NOT NULL DEFAULT 'quarantined'
    CHECK (state IN ('quarantined', 'scanning', 'clean', 'infected', 'error', 'security_hold', 'promoted')),
  result_code text NOT NULL DEFAULT 'pending'
    CHECK (result_code IN ('pending', 'clean', 'infected', 'scanner_error', 'scanner_timeout', 'malformed_response', 'stale_signature', 'hash_mismatch', 'manual_hold')),
  engine_version text CHECK (engine_version IS NULL OR char_length(engine_version) BETWEEN 1 AND 128),
  signature_at timestamptz,
  created_by uuid NOT NULL,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scan_id),
  UNIQUE (tenant_id, quarantine_ref),
  CONSTRAINT fk_file_security_scans_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters(tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_file_security_scans_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (state IN ('quarantined', 'scanning')
      AND result_code = 'pending'
      AND engine_version IS NULL
      AND signature_at IS NULL
      AND observed_sha256 IS NULL
      AND promoted_at IS NULL)
    OR (state = 'clean'
      AND result_code = 'clean'
      AND engine_version IS NOT NULL
      AND signature_at IS NOT NULL
      AND observed_sha256 = expected_sha256
      AND promoted_at IS NULL)
    OR (state = 'infected'
      AND result_code = 'infected'
      AND engine_version IS NOT NULL
      AND signature_at IS NOT NULL
      AND observed_sha256 = expected_sha256
      AND promoted_at IS NULL)
    OR (state = 'error'
      AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
      AND promoted_at IS NULL)
    OR (state = 'security_hold'
      AND result_code IN ('stale_signature', 'hash_mismatch', 'manual_hold')
      AND promoted_at IS NULL)
    OR (state = 'promoted'
      AND result_code = 'clean'
      AND engine_version IS NOT NULL
      AND signature_at IS NOT NULL
      AND observed_sha256 = expected_sha256
      AND promoted_at IS NOT NULL)
  )
);

CREATE TABLE file_security_scan_attempts (
  scan_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  scan_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no >= 1),
  state text NOT NULL DEFAULT 'scanning'
    CHECK (state IN ('scanning', 'clean', 'infected', 'error', 'security_hold')),
  result_code text NOT NULL DEFAULT 'pending'
    CHECK (result_code IN ('pending', 'clean', 'infected', 'scanner_error', 'scanner_timeout', 'malformed_response', 'stale_signature', 'hash_mismatch')),
  expected_sha256 char(64) NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  observed_sha256 char(64) CHECK (observed_sha256 ~ '^[0-9a-f]{64}$'),
  engine_version text CHECK (engine_version IS NULL OR char_length(engine_version) BETWEEN 1 AND 128),
  signature_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scan_attempt_id),
  UNIQUE (tenant_id, scan_id, attempt_no),
  CONSTRAINT fk_file_security_scan_attempts_scan
    FOREIGN KEY (tenant_id, scan_id)
    REFERENCES file_security_scans(tenant_id, scan_id)
    ON DELETE RESTRICT,
  CHECK (
    (state = 'scanning'
      AND result_code = 'pending'
      AND engine_version IS NULL
      AND signature_at IS NULL
      AND observed_sha256 IS NULL
      AND finished_at IS NULL)
    OR (state = 'clean'
      AND result_code = 'clean'
      AND engine_version IS NOT NULL
      AND signature_at IS NOT NULL
      AND observed_sha256 = expected_sha256
      AND finished_at IS NOT NULL)
    OR (state = 'infected'
      AND result_code = 'infected'
      AND engine_version IS NOT NULL
      AND signature_at IS NOT NULL
      AND observed_sha256 = expected_sha256
      AND finished_at IS NOT NULL)
    OR (state = 'error'
      AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
      AND finished_at IS NOT NULL)
    OR (state = 'security_hold'
      AND result_code IN ('stale_signature', 'hash_mismatch')
      AND finished_at IS NOT NULL)
  )
);

CREATE INDEX idx_file_security_scans_tenant_state
  ON file_security_scans (tenant_id, state, updated_at DESC, scan_id);
CREATE INDEX idx_file_security_scan_attempts_tenant_scan
  ON file_security_scan_attempts (tenant_id, scan_id, attempt_no DESC);

CREATE OR REPLACE FUNCTION app_validate_file_security_scan_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.scan_id IS DISTINCT FROM OLD.scan_id
    OR NEW.matter_id IS DISTINCT FROM OLD.matter_id
    OR NEW.quarantine_ref IS DISTINCT FROM OLD.quarantine_ref
    OR NEW.quarantine_storage_uri IS DISTINCT FROM OLD.quarantine_storage_uri
    OR NEW.expected_sha256 IS DISTINCT FROM OLD.expected_sha256
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'file security scan authority fields are immutable';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state
    AND NOT (
      (OLD.state = 'quarantined' AND NEW.state IN ('scanning', 'error', 'security_hold'))
      OR (OLD.state = 'scanning' AND NEW.state IN ('clean', 'infected', 'error', 'security_hold'))
      OR (OLD.state = 'clean' AND NEW.state IN ('promoted', 'security_hold'))
      OR (OLD.state = 'infected' AND NEW.state = 'security_hold')
      OR (OLD.state = 'error' AND NEW.state IN ('scanning', 'security_hold'))
      OR (OLD.state = 'security_hold' AND NEW.state = 'scanning')
    ) THEN
    RAISE EXCEPTION 'invalid file security scan transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF NEW.state = 'promoted' AND OLD.state <> 'clean' THEN
    RAISE EXCEPTION 'only a clean file security scan can be promoted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_security_scans_transition
BEFORE UPDATE ON file_security_scans
FOR EACH ROW EXECUTE FUNCTION app_validate_file_security_scan_transition();

ALTER TABLE file_security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_security_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_file_security_scans_tenant ON file_security_scans
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE file_security_scan_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_security_scan_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_file_security_scan_attempts_tenant ON file_security_scan_attempts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON file_security_scans TO vault_app;
GRANT UPDATE (
  state,
  result_code,
  observed_sha256,
  engine_version,
  signature_at,
  promoted_at,
  updated_at
) ON file_security_scans TO vault_app;
GRANT SELECT, INSERT ON file_security_scan_attempts TO vault_app;
GRANT UPDATE (
  state,
  result_code,
  observed_sha256,
  engine_version,
  signature_at,
  finished_at
) ON file_security_scan_attempts TO vault_app;

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
    SELECT unnest(ARRAY['FILE_QUARANTINED', 'FILE_SCAN_COMPLETED', 'FILE_SECURITY_HELD'])
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
    WHERE action IN ('FILE_QUARANTINED', 'FILE_SCAN_COMPLETED', 'FILE_SECURITY_HELD')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove file security audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> ALL (ARRAY['FILE_QUARANTINED', 'FILE_SCAN_COMPLETED', 'FILE_SECURITY_HELD'])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS file_security_scan_attempts;
DROP TABLE IF EXISTS file_security_scans;
DROP FUNCTION IF EXISTS app_validate_file_security_scan_transition();
