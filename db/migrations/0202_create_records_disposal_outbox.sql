-- Up Migration
-- Sealed disposal inventory deliberately stores only stable references and
-- hashes. Storage keys and provider version IDs remain outside this schema.

CREATE TABLE records_disposal_outbox (
  disposal_outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  disposal_request_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'completed', 'dead_letter', 'blocked')),
  inventory_hash char(64) NOT NULL CHECK (inventory_hash ~ '^[a-f0-9]{64}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_token uuid,
  claim_started_at timestamptz,
  completed_at timestamptz,
  terminal_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code IN (
      'hold_activated',
      'object_lock',
      'version_unavailable',
      'storage_forbidden',
      'storage_timeout',
      'storage_unavailable',
      'reconcile_failed',
      'inventory_invalid'
    )
  ),
  sealed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, disposal_outbox_id),
  UNIQUE (tenant_id, disposal_request_id),
  CONSTRAINT fk_records_disposal_outbox_request
    FOREIGN KEY (tenant_id, disposal_request_id)
    REFERENCES disposal_requests(tenant_id, disposal_request_id)
    ON DELETE RESTRICT,
  CONSTRAINT records_disposal_outbox_state_consistency CHECK (
    (state = 'pending'
      AND claim_token IS NULL
      AND claim_started_at IS NULL
      AND completed_at IS NULL
      AND terminal_at IS NULL
      AND last_error_code IS NULL)
    OR (state = 'processing'
      AND claim_token IS NOT NULL
      AND claim_started_at IS NOT NULL
      AND completed_at IS NULL
      AND terminal_at IS NULL
      AND last_error_code IS NULL)
    OR (state = 'completed'
      AND claim_token IS NULL
      AND claim_started_at IS NULL
      AND completed_at IS NOT NULL
      AND terminal_at IS NULL
      AND last_error_code IS NULL)
    OR (state IN ('dead_letter', 'blocked')
      AND claim_token IS NULL
      AND claim_started_at IS NULL
      AND completed_at IS NULL
      AND terminal_at IS NOT NULL
      AND last_error_code IS NOT NULL)
  )
);

CREATE TABLE records_disposal_inventory (
  disposal_inventory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  disposal_outbox_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid,
  file_object_id uuid NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN ('document_version', 'preview_derivative')),
  storage_key_hash char(64) NOT NULL CHECK (storage_key_hash ~ '^[a-f0-9]{64}$'),
  storage_version_fingerprint char(64) NOT NULL
    CHECK (storage_version_fingerprint ~ '^[a-f0-9]{64}$'),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_ordinal integer NOT NULL CHECK (canonical_ordinal >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, disposal_inventory_id),
  UNIQUE (tenant_id, disposal_outbox_id, canonical_ordinal),
  UNIQUE (tenant_id, disposal_outbox_id, disposal_inventory_id),
  CONSTRAINT fk_records_disposal_inventory_outbox
    FOREIGN KEY (tenant_id, disposal_outbox_id)
    REFERENCES records_disposal_outbox(tenant_id, disposal_outbox_id)
    ON DELETE RESTRICT
);

CREATE TABLE records_disposal_receipts (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  disposal_outbox_id uuid NOT NULL,
  disposal_inventory_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('deleted', 'already_absent')),
  receipt_hash char(64) NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, disposal_outbox_id, disposal_inventory_id),
  CONSTRAINT fk_records_disposal_receipts_inventory
    FOREIGN KEY (tenant_id, disposal_outbox_id, disposal_inventory_id)
    REFERENCES records_disposal_inventory(tenant_id, disposal_outbox_id, disposal_inventory_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_records_disposal_outbox_tenant_state
  ON records_disposal_outbox (tenant_id, state, created_at ASC, disposal_outbox_id);
CREATE INDEX idx_records_disposal_inventory_tenant_outbox
  ON records_disposal_inventory (tenant_id, disposal_outbox_id, canonical_ordinal);

CREATE OR REPLACE FUNCTION app_validate_records_disposal_outbox_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.disposal_outbox_id IS DISTINCT FROM OLD.disposal_outbox_id
    OR NEW.disposal_request_id IS DISTINCT FROM OLD.disposal_request_id
    OR NEW.inventory_hash IS DISTINCT FROM OLD.inventory_hash
    OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'records disposal outbox sealed authority fields are immutable';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT (
      (OLD.state = 'pending' AND NEW.state = 'processing')
      OR (OLD.state = 'processing' AND NEW.state IN ('pending', 'completed', 'dead_letter', 'blocked'))
    ) THEN
      RAISE EXCEPTION 'invalid records disposal outbox transition: % -> %', OLD.state, NEW.state;
    END IF;
  END IF;

  IF OLD.state = 'pending' AND NEW.state = 'processing' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1 THEN
      RAISE EXCEPTION 'records disposal outbox claim must increment attempt count';
    END IF;
  ELSIF NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN
    RAISE EXCEPTION 'records disposal outbox attempt count is immutable outside claim';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_records_disposal_outbox_transition
BEFORE UPDATE ON records_disposal_outbox
FOR EACH ROW EXECUTE FUNCTION app_validate_records_disposal_outbox_transition();

CREATE OR REPLACE FUNCTION app_block_records_disposal_inventory_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'records disposal inventory is append-only: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_records_disposal_inventory_block_mutation
BEFORE UPDATE OR DELETE ON records_disposal_inventory
FOR EACH ROW EXECUTE FUNCTION app_block_records_disposal_inventory_mutation();

CREATE OR REPLACE FUNCTION app_block_records_disposal_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'records disposal receipt is append-only: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_records_disposal_receipts_block_mutation
BEFORE UPDATE OR DELETE ON records_disposal_receipts
FOR EACH ROW EXECUTE FUNCTION app_block_records_disposal_receipt_mutation();

CREATE OR REPLACE FUNCTION app_validate_records_disposal_inventory_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_hash char(64);
  computed_hash char(64);
  inventory_count integer;
BEGIN
  SELECT inventory_hash
  INTO expected_hash
  FROM records_disposal_outbox
  WHERE tenant_id = NEW.tenant_id
    AND disposal_outbox_id = NEW.disposal_outbox_id;

  SELECT
    count(*)::integer,
    encode(
      digest(
        string_agg(
          concat_ws(
            ':',
            document_id::text,
            coalesce(document_version_id::text, ''),
            file_object_id::text,
            object_kind,
            storage_key_hash,
            storage_version_fingerprint,
            content_sha256,
            canonical_ordinal::text
          ),
          E'\n' ORDER BY canonical_ordinal
        ),
        'sha256'
      ),
      'hex'
    )::char(64)
  INTO inventory_count, computed_hash
  FROM records_disposal_inventory
  WHERE tenant_id = NEW.tenant_id
    AND disposal_outbox_id = NEW.disposal_outbox_id;

  IF expected_hash IS NULL OR inventory_count = 0 OR computed_hash IS DISTINCT FROM expected_hash THEN
    RAISE EXCEPTION 'records disposal inventory hash does not match sealed outbox';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_records_disposal_outbox_inventory_hash
AFTER INSERT OR UPDATE ON records_disposal_outbox
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_validate_records_disposal_inventory_hash();

CREATE CONSTRAINT TRIGGER trg_records_disposal_inventory_hash
AFTER INSERT ON records_disposal_inventory
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_validate_records_disposal_inventory_hash();

ALTER TABLE records_disposal_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_disposal_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_records_disposal_outbox_tenant ON records_disposal_outbox
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE records_disposal_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_disposal_inventory FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_records_disposal_inventory_tenant ON records_disposal_inventory
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE records_disposal_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_disposal_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_records_disposal_receipts_tenant ON records_disposal_receipts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON records_disposal_outbox TO vault_app;
GRANT UPDATE (
  state,
  attempt_count,
  claim_token,
  claim_started_at,
  completed_at,
  terminal_at,
  last_error_code,
  updated_at
) ON records_disposal_outbox TO vault_app;
GRANT SELECT, INSERT ON records_disposal_inventory TO vault_app;
GRANT SELECT, INSERT ON records_disposal_receipts TO vault_app;

-- Down Migration

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM records_disposal_receipts LIMIT 1)
    OR EXISTS (SELECT 1 FROM records_disposal_inventory LIMIT 1)
    OR EXISTS (SELECT 1 FROM records_disposal_outbox LIMIT 1) THEN
    RAISE EXCEPTION 'cannot rollback 0202 while sealed disposal evidence exists';
  END IF;
END;
$$;

DROP TABLE records_disposal_receipts;
DROP TABLE records_disposal_inventory;
DROP TABLE records_disposal_outbox;
DROP FUNCTION app_validate_records_disposal_inventory_hash();
DROP FUNCTION app_block_records_disposal_receipt_mutation();
DROP FUNCTION app_block_records_disposal_inventory_mutation();
DROP FUNCTION app_validate_records_disposal_outbox_transition();
