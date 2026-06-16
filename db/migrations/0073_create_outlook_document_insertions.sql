-- Up Migration

CREATE TABLE outlook_document_insertions (
  insertion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  mailbox_fingerprint_hash char(64) NOT NULL CHECK (mailbox_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  outlook_item_id_hash char(64) NOT NULL CHECK (outlook_item_id_hash ~ '^[0-9a-f]{64}$'),
  canonical_message_sha256 char(64) NOT NULL CHECK (canonical_message_sha256 ~ '^[0-9a-f]{64}$'),
  has_external_recipients boolean NOT NULL DEFAULT false,
  insertion_mode text NOT NULL CHECK (insertion_mode IN ('attach-copy', 'internal-reference')),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'denied')),
  denied_reason_code text CHECK (
    denied_reason_code IS NULL
    OR denied_reason_code IN (
      'permission_denied',
      'policy_denied',
      'integration_gate_closed',
      'document_locked'
    )
  ),
  source_client text NOT NULL CHECK (source_client = 'outlook-web-addin'),
  client_request_id_hash char(64) NOT NULL CHECK (client_request_id_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, insertion_id),
  UNIQUE (tenant_id, user_id, idempotency_key_hash),
  UNIQUE (tenant_id, user_id, client_request_id_hash),
  UNIQUE (
    tenant_id,
    user_id,
    document_id,
    version_id,
    canonical_message_sha256,
    insertion_mode
  ),
  CONSTRAINT fk_outlook_document_insertions_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_document_insertions_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_outlook_document_insertions_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_outlook_document_insertions_tenant_document
  ON outlook_document_insertions (tenant_id, document_id, created_at DESC, insertion_id);

CREATE INDEX idx_outlook_document_insertions_tenant_user_status
  ON outlook_document_insertions (tenant_id, user_id, status, created_at DESC, insertion_id);

ALTER TABLE outlook_document_insertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_document_insertions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_outlook_document_insertions_tenant ON outlook_document_insertions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outlook_document_insertions TO vault_app;

COMMENT ON TABLE outlook_document_insertions IS
  'Tenant-scoped Outlook document insertion requests. Stores refs, hashes, bounded mode/status, and idempotency only; no document title, body, filename, public link, endpoint, token, or customer mailbox value.';

COMMENT ON COLUMN outlook_document_insertions.insertion_mode IS
  'attach-copy remains policy-denied until a reviewed copy/transport gate exists; internal-reference never creates public, guest, secure, or VDR links.';

COMMENT ON COLUMN outlook_document_insertions.mailbox_fingerprint_hash IS
  'Server-accepted mailbox fingerprint hash. Raw mailbox address or account id must never be stored.';

COMMENT ON COLUMN outlook_document_insertions.outlook_item_id_hash IS
  'Hash of the target Outlook item reference. Raw Office/Graph item id must never be stored.';

-- Down Migration

DROP TABLE IF EXISTS outlook_document_insertions;
