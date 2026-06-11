-- Up Migration

ALTER TABLE documents
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid,
  ADD COLUMN deleted_previous_status text;

-- Rollback/reapply safety: a dirty dev database may already contain soft-deleted
-- rows from tests after this migration's down path removed marker columns.
-- Backfill conservative markers before reintroducing NOT-NULL-by-status checks.
UPDATE documents
SET deleted_at = COALESCE(updated_at, created_at),
    deleted_by = created_by,
    deleted_previous_status = 'draft'
WHERE status = 'deleted'
  AND deleted_at IS NULL
  AND deleted_by IS NULL
  AND deleted_previous_status IS NULL;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_deleted_by
    FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT documents_deleted_previous_status_check CHECK (
    deleted_previous_status IS NULL
    OR deleted_previous_status IN (
      'draft',
      'internal_review',
      'client_sent',
      'counterparty_sent',
      'markup_received',
      'negotiation',
      'final',
      'executed'
    )
  ),
  ADD CONSTRAINT documents_deleted_marker_check CHECK (
    (
      status = 'deleted'
      AND deleted_at IS NOT NULL
      AND deleted_by IS NOT NULL
      AND deleted_previous_status IS NOT NULL
    )
    OR (
      status <> 'deleted'
      AND deleted_at IS NULL
      AND deleted_by IS NULL
      AND deleted_previous_status IS NULL
    )
  );

CREATE INDEX idx_documents_tenant_deleted_at
  ON documents (tenant_id, deleted_at DESC, document_id)
  WHERE status = 'deleted';

GRANT UPDATE (
  status,
  deleted_at,
  deleted_by,
  deleted_previous_status,
  updated_at
) ON documents TO vault_app;

COMMENT ON COLUMN documents.deleted_previous_status IS
  'R2 soft-delete restore marker. It records the pre-delete status without enabling hard delete.';

-- Down Migration

DROP INDEX IF EXISTS idx_documents_tenant_deleted_at;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_deleted_marker_check,
  DROP CONSTRAINT IF EXISTS documents_deleted_previous_status_check,
  DROP CONSTRAINT IF EXISTS fk_documents_deleted_by,
  DROP COLUMN IF EXISTS deleted_previous_status,
  DROP COLUMN IF EXISTS deleted_by,
  DROP COLUMN IF EXISTS deleted_at;
