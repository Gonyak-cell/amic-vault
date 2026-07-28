-- Up Migration

CREATE TABLE saved_items (
  saved_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  target_type text NOT NULL
    CONSTRAINT saved_items_target_type_check
    CHECK (target_type IN ('document', 'matter', 'saved_search')),
  target_id uuid NOT NULL,
  position smallint NOT NULL
    CONSTRAINT saved_items_position_range_check
    CHECK (position BETWEEN 0 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, saved_item_id),
  UNIQUE (tenant_id, user_id, target_type, target_id),
  CONSTRAINT saved_items_position_unique
    UNIQUE (tenant_id, user_id, position)
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT fk_saved_items_user
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_saved_items_tenant_user_position
  ON saved_items (tenant_id, user_id, position, saved_item_id);

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_saved_items_tenant ON saved_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON saved_items TO vault_app;
GRANT UPDATE (position, updated_at) ON saved_items TO vault_app;

COMMENT ON TABLE saved_items IS
  'Personal navigation preferences only. A row never grants target access; all target reads remain permission-scoped.';
COMMENT ON COLUMN saved_items.target_id IS
  'Polymorphic internal target reference. Permission-bound list transactions remove targets that are no longer visible.';

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
    SELECT unnest(ARRAY[
      'SAVED_ITEM_ADDED',
      'SAVED_ITEM_REMOVED',
      'SAVED_ITEMS_REORDERED'
    ])
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
    WHERE action IN (
      'SAVED_ITEM_ADDED',
      'SAVED_ITEM_REMOVED',
      'SAVED_ITEMS_REORDERED'
    )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove saved item audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> ALL (ARRAY[
        'SAVED_ITEM_ADDED',
        'SAVED_ITEM_REMOVED',
        'SAVED_ITEMS_REORDERED'
      ])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS saved_items;
