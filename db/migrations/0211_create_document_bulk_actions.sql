-- Up Migration

CREATE TABLE document_bulk_action_batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  action_kind text NOT NULL CHECK (
    action_kind IN ('move_folder', 'add_tag', 'remove_tag', 'transition_status')
  ),
  target_folder_id uuid,
  target_tag text,
  target_status text,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'partial', 'failed')
  ),
  total_count smallint NOT NULL CHECK (total_count BETWEEN 1 AND 100),
  succeeded_count smallint NOT NULL DEFAULT 0 CHECK (succeeded_count BETWEEN 0 AND 100),
  failed_count smallint NOT NULL DEFAULT 0 CHECK (failed_count BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  receipt_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (tenant_id, batch_id),
  UNIQUE (tenant_id, actor_user_id, idempotency_key),
  CONSTRAINT fk_document_bulk_action_batches_actor
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_bulk_action_batches_counts_check
    CHECK (succeeded_count + failed_count <= total_count),
  CONSTRAINT document_bulk_action_batches_receipt_retention_check
    CHECK (
      receipt_expires_at > created_at
      AND receipt_expires_at <= created_at + interval '30 days 5 minutes'
    ),
  CONSTRAINT document_bulk_action_batches_parameter_check
    CHECK (
      (
        action_kind = 'move_folder'
        AND target_folder_id IS NOT NULL
        AND target_tag IS NULL
        AND target_status IS NULL
      )
      OR (
        action_kind IN ('add_tag', 'remove_tag')
        AND target_folder_id IS NULL
        AND target_tag IS NOT NULL
        AND length(btrim(target_tag)) BETWEEN 1 AND 80
        AND target_tag !~ '[[:cntrl:]]'
        AND target_status IS NULL
      )
      OR (
        action_kind = 'transition_status'
        AND target_folder_id IS NULL
        AND target_tag IS NULL
        AND target_status IN (
          'draft',
          'internal_review',
          'client_sent',
          'counterparty_sent',
          'markup_received',
          'negotiation',
          'final',
          'executed',
          'archived'
        )
      )
    )
);

CREATE TABLE document_bulk_action_items (
  batch_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  document_id uuid NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 99),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed')
  ),
  error_code text CHECK (
    error_code IS NULL OR error_code IN (
      'AUTH_REQUIRED',
      'PERMISSION_DENIED',
      'ETHICAL_WALL_BLOCKED',
      'AI_POLICY_BLOCKED',
      'DOCUMENT_LOCKED',
      'VALIDATION_FAILED',
      'UNSUPPORTED_FILE_TYPE',
      'EXTERNAL_LINK_EXPIRED',
      'TENANT_ISOLATION_VIOLATION'
    )
  ),
  reason_code text CHECK (
    reason_code IS NULL OR reason_code ~ '^[A-Z0-9_:-]{1,80}$'
  ),
  retry_count smallint NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id, document_id),
  UNIQUE (tenant_id, batch_id, position),
  CONSTRAINT fk_document_bulk_action_items_batch
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES document_bulk_action_batches (tenant_id, batch_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_document_bulk_action_items_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_bulk_action_items_error_check
    CHECK (
      (status = 'failed' AND error_code IS NOT NULL)
      OR (status <> 'failed' AND error_code IS NULL AND reason_code IS NULL)
    )
);

CREATE INDEX idx_document_bulk_action_batches_actor
  ON document_bulk_action_batches (
    tenant_id,
    actor_user_id,
    created_at DESC,
    batch_id
  );
CREATE INDEX idx_document_bulk_action_items_batch
  ON document_bulk_action_items (tenant_id, batch_id, position);

ALTER TABLE document_bulk_action_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_bulk_action_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE document_bulk_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_bulk_action_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_document_bulk_action_batches_tenant ON document_bulk_action_batches
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY rls_document_bulk_action_items_tenant ON document_bulk_action_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON document_bulk_action_batches TO vault_app;
GRANT UPDATE (
  status,
  succeeded_count,
  failed_count,
  started_at,
  completed_at,
  updated_at
) ON document_bulk_action_batches TO vault_app;
GRANT SELECT, INSERT ON document_bulk_action_items TO vault_app;
GRANT UPDATE (
  status,
  error_code,
  reason_code,
  retry_count,
  started_at,
  completed_at,
  updated_at
) ON document_bulk_action_items TO vault_app;

COMMENT ON TABLE document_bulk_action_batches IS
  'Reference-only receipt for permission-first document bulk mutations. No document title, body, snippet, object key, raw query, token, wall membership, or permission reason is stored.';
COMMENT ON COLUMN document_bulk_action_batches.target_tag IS
  'Bounded document metadata required to replay one tag mutation; it is never copied into audit metadata.';
COMMENT ON TABLE document_bulk_action_items IS
  'Per-document safe status receipt. A row grants no document access and every worker attempt re-enters the existing mutation permission path.';

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
      'DOCUMENT_BULK_ACTION_CREATED',
      'DOCUMENT_BULK_ACTION_COMPLETED',
      'DOCUMENT_BULK_ACTION_RETRIED'
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
      'DOCUMENT_BULK_ACTION_CREATED',
      'DOCUMENT_BULK_ACTION_COMPLETED',
      'DOCUMENT_BULK_ACTION_RETRIED'
    )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove document bulk action audit actions while append-only audit rows exist';
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
        'DOCUMENT_BULK_ACTION_CREATED',
        'DOCUMENT_BULK_ACTION_COMPLETED',
        'DOCUMENT_BULK_ACTION_RETRIED'
      ])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

DROP TABLE IF EXISTS document_bulk_action_items;
DROP TABLE IF EXISTS document_bulk_action_batches;
