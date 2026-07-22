-- Up Migration

-- Existing lock-protected review transitions a pending internal answer only to
-- its reviewed terminal state. RLS, review constraints and audit remain in
-- force.
GRANT UPDATE (status, reviewed_by_internal_user_id, reviewed_at)
  ON external_qa_messages TO vault_app;

-- Down Migration

REVOKE UPDATE (status, reviewed_by_internal_user_id, reviewed_at)
  ON external_qa_messages FROM vault_app;
