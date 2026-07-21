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
    SELECT 'AUDIT_ANCHOR_RECORDED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE audit_daily_anchors (
  anchor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  anchor_date date NOT NULL,
  seq_start bigint,
  seq_end bigint,
  event_count integer NOT NULL CHECK (event_count >= 0),
  events_hash text NOT NULL CHECK (events_hash ~ '^[0-9a-f]{64}$'),
  previous_anchor_hash text CHECK (
    previous_anchor_hash IS NULL OR previous_anchor_hash ~ '^[0-9a-f]{64}$'
  ),
  anchor_hash text NOT NULL CHECK (anchor_hash ~ '^[0-9a-f]{64}$'),
  storage_uri text CHECK (
    storage_uri IS NULL OR storage_uri LIKE 's3://%'
  ),
  recorded_audit_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, anchor_id),
  UNIQUE (tenant_id, anchor_date),
  UNIQUE (tenant_id, anchor_hash),
  CONSTRAINT audit_daily_anchors_seq_range_check CHECK (
    (event_count = 0 AND seq_start IS NULL AND seq_end IS NULL)
    OR (event_count > 0 AND seq_start IS NOT NULL AND seq_end IS NOT NULL AND seq_end >= seq_start)
  ),
  CONSTRAINT fk_audit_daily_anchors_recorded_audit_event
    FOREIGN KEY (tenant_id, recorded_audit_event_id)
    REFERENCES audit_events (tenant_id, event_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_audit_daily_anchors_tenant_created
  ON audit_daily_anchors (tenant_id, created_at DESC, anchor_date DESC);

ALTER TABLE audit_daily_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_daily_anchors FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_audit_daily_anchors_tenant ON audit_daily_anchors
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION audit_daily_anchors_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_daily_anchors is append-only: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_daily_anchors_block_update_delete
  BEFORE UPDATE OR DELETE ON audit_daily_anchors
  FOR EACH ROW EXECUTE FUNCTION audit_daily_anchors_block_mutation();

CREATE TRIGGER trg_audit_daily_anchors_block_truncate
  BEFORE TRUNCATE ON audit_daily_anchors
  FOR EACH STATEMENT EXECUTE FUNCTION audit_daily_anchors_block_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_daily_anchors FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_daily_anchors FROM vault_app;
GRANT SELECT, INSERT ON audit_daily_anchors TO vault_app;

COMMENT ON TABLE audit_daily_anchors IS
  'Append-only daily audit hash anchors. Each row chains the deterministic hash of one UTC audit_events day with the previous tenant anchor hash.';
COMMENT ON COLUMN audit_daily_anchors.storage_uri IS
  'Optional immutable object-store receipt for the anchor payload. Object Lock is an operations setting outside this schema.';

-- Down Migration

DROP TRIGGER IF EXISTS trg_audit_daily_anchors_block_truncate ON audit_daily_anchors;
DROP TRIGGER IF EXISTS trg_audit_daily_anchors_block_update_delete ON audit_daily_anchors;
DROP FUNCTION IF EXISTS audit_daily_anchors_block_mutation();
DROP TABLE IF EXISTS audit_daily_anchors;

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
        match[1] <> 'AUDIT_ANCHOR_RECORDED'
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
