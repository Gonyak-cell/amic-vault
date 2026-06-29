-- Up Migration

CREATE TABLE onedrive_source_cutovers (
  cutover_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  run_id text NOT NULL CHECK (run_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$'),
  status text NOT NULL CHECK (status IN ('executed')),
  source_system text NOT NULL DEFAULT 'onedrive' CHECK (source_system = 'onedrive'),
  vault_source_of_truth boolean NOT NULL DEFAULT true CHECK (vault_source_of_truth = true),
  onedrive_connected_state_claimed boolean NOT NULL DEFAULT false
    CHECK (onedrive_connected_state_claimed = false),
  office_open_save_sync_claimed boolean NOT NULL DEFAULT false
    CHECK (office_open_save_sync_claimed = false),
  gemma_indexing_executed boolean NOT NULL DEFAULT false
    CHECK (gemma_indexing_executed = false),
  cutover_approval_ref text NOT NULL CHECK (
    cutover_approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$'
  ),
  source_of_truth_control_ref text NOT NULL CHECK (
    source_of_truth_control_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$'
  ),
  import_closeout_ref text NOT NULL CHECK (
    import_closeout_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$'
  ),
  preflight_ref text NOT NULL CHECK (
    preflight_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$'
  ),
  approved_scope_rows integer NOT NULL CHECK (approved_scope_rows > 0),
  resolved_import_manifest_rows integer NOT NULL CHECK (resolved_import_manifest_rows > 0),
  imported_or_reused_count integer NOT NULL CHECK (imported_or_reused_count >= 0),
  allowed_skipped_count integer NOT NULL CHECK (allowed_skipped_count >= 0),
  ready_count integer NOT NULL DEFAULT 0 CHECK (ready_count = 0),
  blocked_count integer NOT NULL DEFAULT 0 CHECK (blocked_count = 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count = 0),
  receipt_hash char(64) NOT NULL CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$'),
  executed_by uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cutover_id),
  UNIQUE (tenant_id, run_id),
  CONSTRAINT fk_onedrive_source_cutovers_executed_by
    FOREIGN KEY (tenant_id, executed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT onedrive_source_cutovers_scope_reconciles CHECK (
    approved_scope_rows = resolved_import_manifest_rows
    AND imported_or_reused_count + allowed_skipped_count = approved_scope_rows
  )
);

CREATE INDEX idx_onedrive_source_cutovers_tenant_created
  ON onedrive_source_cutovers (tenant_id, created_at DESC);

ALTER TABLE onedrive_source_cutovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE onedrive_source_cutovers FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_onedrive_source_cutovers_tenant ON onedrive_source_cutovers
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON onedrive_source_cutovers TO vault_app;

COMMENT ON TABLE onedrive_source_cutovers IS
  'Tenant-scoped OneDrive-to-Vault source-of-truth cutover control receipts. Stores only counts, refs, hashes, and safety flags.';

-- Down Migration

DROP TABLE IF EXISTS onedrive_source_cutovers;
