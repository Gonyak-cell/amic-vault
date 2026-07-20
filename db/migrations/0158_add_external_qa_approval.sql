-- Up Migration

ALTER TABLE external_qa_messages
  ADD COLUMN status text NOT NULL DEFAULT 'published',
  ADD COLUMN visibility_scope text NOT NULL DEFAULT 'workspace',
  ADD COLUMN reviewed_by_internal_user_id uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD CONSTRAINT external_qa_messages_status_check
    CHECK (status IN ('draft', 'pending_approval', 'published', 'rejected')),
  ADD CONSTRAINT external_qa_messages_visibility_scope_check
    CHECK (visibility_scope IN ('asker_only', 'workspace')),
  ADD CONSTRAINT fk_external_qa_messages_reviewer
    FOREIGN KEY (tenant_id, reviewed_by_internal_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT external_qa_messages_question_state_check CHECK (
    direction <> 'external_question'
    OR (
      status = 'published'
      AND visibility_scope = 'workspace'
      AND reviewed_by_internal_user_id IS NULL
      AND reviewed_at IS NULL
    )
  ),
  ADD CONSTRAINT external_qa_messages_review_pair_check CHECK (
    (reviewed_by_internal_user_id IS NULL AND reviewed_at IS NULL)
    OR (reviewed_by_internal_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  );

CREATE INDEX idx_external_qa_messages_workspace_visible
  ON external_qa_messages (
    tenant_id,
    workspace_id,
    status,
    visibility_scope,
    created_at,
    qa_message_id
  );

COMMENT ON COLUMN external_qa_messages.status IS
  'G12 internal answer approval state. External questions remain published without approval.';

COMMENT ON COLUMN external_qa_messages.visibility_scope IS
  'G12 published answer visibility: asker_only or workspace.';

-- Down Migration

DROP INDEX IF EXISTS idx_external_qa_messages_workspace_visible;

ALTER TABLE external_qa_messages
  DROP CONSTRAINT IF EXISTS external_qa_messages_review_pair_check,
  DROP CONSTRAINT IF EXISTS external_qa_messages_question_state_check,
  DROP CONSTRAINT IF EXISTS fk_external_qa_messages_reviewer,
  DROP CONSTRAINT IF EXISTS external_qa_messages_visibility_scope_check,
  DROP CONSTRAINT IF EXISTS external_qa_messages_status_check,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by_internal_user_id,
  DROP COLUMN IF EXISTS visibility_scope,
  DROP COLUMN IF EXISTS status;
