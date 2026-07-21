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
    SELECT 'CLOSING_BINDER_CREATED'
    UNION
    SELECT 'CLOSING_BINDER_FINALIZED'
    UNION
    SELECT 'CLOSING_BINDER_MANIFEST_DOWNLOADED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE closing_binders (
  closing_binder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  manifest_json jsonb NOT NULL CHECK (
    jsonb_typeof(manifest_json) = 'object'
    AND octet_length(manifest_json::text) <= 262144
  ),
  manifest_sha256 char(64) NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_by uuid NOT NULL,
  finalized_by uuid,
  finalized_at timestamptz,
  records_archive_count integer NOT NULL DEFAULT 0 CHECK (records_archive_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, closing_binder_id),
  UNIQUE (tenant_id, matter_id),
  CONSTRAINT fk_closing_binders_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_closing_binders_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_closing_binders_finalized_by
    FOREIGN KEY (tenant_id, finalized_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT closing_binders_finalize_consistency CHECK (
    (status = 'draft' AND finalized_by IS NULL AND finalized_at IS NULL)
    OR (status = 'finalized' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
  )
);

CREATE INDEX idx_closing_binders_matter_status
  ON closing_binders (tenant_id, matter_id, status, updated_at DESC);

ALTER TABLE closing_binders ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_binders FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_closing_binders_tenant ON closing_binders
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON closing_binders TO vault_app;
GRANT UPDATE (
  manifest_json,
  manifest_sha256,
  status,
  finalized_by,
  finalized_at,
  records_archive_count,
  updated_at
) ON closing_binders TO vault_app;

CREATE OR REPLACE FUNCTION closing_binders_block_finalized_manifest_update()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'finalized'
    AND (
      NEW.manifest_json IS DISTINCT FROM OLD.manifest_json
      OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.matter_id IS DISTINCT FROM OLD.matter_id
    )
  THEN
    RAISE EXCEPTION 'closing binder finalized manifest is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_closing_binders_block_finalized_manifest_update
  BEFORE UPDATE ON closing_binders
  FOR EACH ROW EXECUTE FUNCTION closing_binders_block_finalized_manifest_update();

ALTER TABLE records_archives
  ADD COLUMN closing_binder_id uuid;

ALTER TABLE records_archives
  ADD CONSTRAINT fk_records_archives_closing_binder
    FOREIGN KEY (tenant_id, closing_binder_id)
    REFERENCES closing_binders (tenant_id, closing_binder_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_records_archives_closing_binder
  ON records_archives (tenant_id, closing_binder_id, created_at DESC)
  WHERE closing_binder_id IS NOT NULL;

GRANT UPDATE (closing_binder_id) ON records_archives TO vault_app;

COMMENT ON TABLE closing_binders IS
  'Tenant-scoped Matter closing binder manifest. Stores document/email refs, hashes, labels, and bounded titles only; no document body, raw email body, token, or secret.';

COMMENT ON COLUMN records_archives.closing_binder_id IS
  'Optional reference tying archived document rows to the Matter closing binder manifest that finalized them.';

-- Down Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN (
      'CLOSING_BINDER_CREATED',
      'CLOSING_BINDER_FINALIZED',
      'CLOSING_BINDER_MANIFEST_DOWNLOADED'
    )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove A12 closing binder audit actions while append-only audit rows exist';
  END IF;

  ALTER TABLE records_archives DROP CONSTRAINT IF EXISTS fk_records_archives_closing_binder;
  DROP INDEX IF EXISTS idx_records_archives_closing_binder;
  ALTER TABLE records_archives DROP COLUMN IF EXISTS closing_binder_id;

  DROP TRIGGER IF EXISTS trg_closing_binders_block_finalized_manifest_update ON closing_binders;
  DROP FUNCTION IF EXISTS closing_binders_block_finalized_manifest_update();
  DROP TABLE IF EXISTS closing_binders;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] NOT IN (
        'CLOSING_BINDER_CREATED',
        'CLOSING_BINDER_FINALIZED',
        'CLOSING_BINDER_MANIFEST_DOWNLOADED'
      )
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
