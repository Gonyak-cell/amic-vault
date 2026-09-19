-- Up Migration
ALTER TABLE amic_os_office_copies
  ADD COLUMN copy_kind text NOT NULL DEFAULT 'office' CHECK (copy_kind IN ('office', 'generic'));
CREATE TABLE amic_os_document_copy_snapshots (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  snapshot_id text NOT NULL CHECK (snapshot_id ~ '^document-copy-snapshot:[0-9a-f-]{36}$'),
  copy_id text NOT NULL,
  quarantine_ref uuid NOT NULL,
  source_exact jsonb NOT NULL,
  file_json jsonb NOT NULL,
  mode text NOT NULL CHECK (mode IN ('clone', 'upload')),
  preflight_json jsonb NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  scan_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, snapshot_id),
  UNIQUE (tenant_id, quarantine_ref),
  FOREIGN KEY (tenant_id, copy_id) REFERENCES amic_os_office_copies (tenant_id, copy_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, scan_id) REFERENCES file_security_scans (tenant_id, scan_id) ON DELETE RESTRICT,
  CHECK ((file_json->>'byte_size')::bigint BETWEEN 1 AND 26214400)
);
ALTER TABLE amic_os_document_copy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE amic_os_document_copy_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_amic_os_document_copy_snapshots_tenant ON amic_os_document_copy_snapshots
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON amic_os_document_copy_snapshots TO vault_app;
GRANT UPDATE (scan_id) ON amic_os_document_copy_snapshots TO vault_app;

-- Down Migration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM amic_os_document_copy_snapshots) THEN
    RAISE EXCEPTION 'Retained document copies must be preserved before rollback';
  END IF;
END $$;
DROP TABLE amic_os_document_copy_snapshots;
ALTER TABLE amic_os_office_copies DROP COLUMN copy_kind;
