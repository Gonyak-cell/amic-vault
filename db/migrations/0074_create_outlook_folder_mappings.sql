-- Up Migration

CREATE TABLE outlook_folder_mappings (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  folder_ref_hash char(64) NOT NULL CHECK (folder_ref_hash ~ '^[0-9a-f]{64}$'),
  folder_path_hash char(64) CHECK (
    folder_path_hash IS NULL OR folder_path_hash ~ '^[0-9a-f]{64}$'
  ),
  mapping_mode text NOT NULL DEFAULT 'manual' CHECK (mapping_mode IN ('manual', 'auto_file')),
  approval_status text NOT NULL DEFAULT 'pending_user' CHECK (
    approval_status IN ('pending_user', 'pending_admin', 'active', 'disabled', 'revoked', 'denied')
  ),
  requested_auto_file boolean NOT NULL DEFAULT false,
  auto_file_enabled boolean NOT NULL DEFAULT false,
  denied_reason_code text CHECK (
    denied_reason_code IS NULL
    OR denied_reason_code IN (
      'permission_denied',
      'policy_denied',
      'integration_gate_closed',
      'approval_required'
    )
  ),
  source_client text NOT NULL CHECK (source_client = 'outlook-web-addin'),
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  approval_actor_id uuid,
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mapping_id),
  UNIQUE (tenant_id, user_id, idempotency_key_hash),
  UNIQUE (tenant_id, user_id, client_request_id_hash),
  UNIQUE (
    tenant_id,
    user_id,
    mailbox_fingerprint_hash,
    folder_ref_hash,
    matter_id,
    mapping_mode
  ),
  CONSTRAINT outlook_folder_mappings_autofile_requires_active CHECK (
    auto_file_enabled = false OR approval_status = 'active'
  ),
  CONSTRAINT fk_outlook_folder_mappings_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_folder_mappings_approval_actor
    FOREIGN KEY (tenant_id, approval_actor_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_folder_mappings_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_folder_mappings_tenant_matter
  ON outlook_folder_mappings (tenant_id, matter_id, approval_status, created_at DESC, mapping_id);

CREATE INDEX idx_outlook_folder_mappings_tenant_user_status
  ON outlook_folder_mappings (tenant_id, user_id, approval_status, created_at DESC, mapping_id);

ALTER TABLE outlook_folder_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_folder_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_folder_mappings_tenant ON outlook_folder_mappings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_folder_mappings TO vault_app;

COMMENT ON TABLE outlook_folder_mappings IS
  'Tenant-scoped Outlook folder-to-matter mappings. Stores only mailbox/folder hashes, Vault refs, bounded status, and idempotency refs; raw folder names, folder paths, mailbox addresses, Graph ids, tokens, subjects, bodies, filenames, and headers are forbidden.';

COMMENT ON COLUMN outlook_folder_mappings.folder_ref_hash IS
  'Hash of the Outlook folder reference. Raw Office or Graph folder ids must never be stored.';

COMMENT ON COLUMN outlook_folder_mappings.folder_path_hash IS
  'Optional hash of a normalized folder path for dedupe only. Raw path segments and matter names must never be stored.';

COMMENT ON COLUMN outlook_folder_mappings.auto_file_enabled IS
  'Default false. May become true only after reviewed tenant/admin approval and an enabled auto-file gate.';

CREATE TABLE outlook_autofile_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  mapping_id uuid NOT NULL,
  user_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  folder_ref_hash char(64) NOT NULL CHECK (folder_ref_hash ~ '^[0-9a-f]{64}$'),
  canonical_message_sha256 char(64) NOT NULL CHECK (canonical_message_sha256 ~ '^[0-9a-f]{64}$'),
  dedupe_hash char(64) NOT NULL CHECK (dedupe_hash ~ '^[0-9a-f]{64}$'),
  expected_matter_id uuid,
  status text NOT NULL DEFAULT 'disabled' CHECK (
    status IN ('disabled', 'queued', 'processing', 'completed', 'denied', 'failed', 'retrying')
  ),
  denied_reason_code text CHECK (
    denied_reason_code IS NULL
    OR denied_reason_code IN (
      'permission_denied',
      'policy_denied',
      'stale_mailbox',
      'duplicate',
      'integration_gate_closed',
      'wrong_matter'
    )
  ),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 10),
  next_retry_at timestamptz,
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_id),
  UNIQUE (tenant_id, mapping_id, idempotency_key_hash),
  UNIQUE (tenant_id, mapping_id, dedupe_hash),
  CONSTRAINT fk_outlook_autofile_jobs_mapping
    FOREIGN KEY (tenant_id, mapping_id)
    REFERENCES outlook_folder_mappings (tenant_id, mapping_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_autofile_jobs_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_autofile_jobs_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_autofile_jobs_expected_matter
    FOREIGN KEY (tenant_id, expected_matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_autofile_jobs_tenant_mapping_status
  ON outlook_autofile_jobs (tenant_id, mapping_id, status, created_at DESC, job_id);

CREATE INDEX idx_outlook_autofile_jobs_tenant_matter
  ON outlook_autofile_jobs (tenant_id, matter_id, created_at DESC, job_id);

ALTER TABLE outlook_autofile_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_autofile_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_autofile_jobs_tenant ON outlook_autofile_jobs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_autofile_jobs TO vault_app;

COMMENT ON TABLE outlook_autofile_jobs IS
  'Reference-only Outlook auto-file job records. Live Graph polling/notification execution remains gated; rows contain hashes, Vault refs, retry state, and safe reason codes only.';

COMMENT ON COLUMN outlook_autofile_jobs.dedupe_hash IS
  'Hash-only dedupe key for a mapped folder and message. Raw subject, body, Message-ID, Graph id, and folder path values are forbidden.';

-- Down Migration

DROP TABLE IF EXISTS outlook_autofile_jobs;
DROP TABLE IF EXISTS outlook_folder_mappings;
