-- Up Migration

-- Existing internal review changes only the approval state and reviewer
-- reference on an R11 Q&A message. Preserve RLS and grant only those columns.
GRANT UPDATE (status, reviewed_by_internal_user_id, reviewed_at)
  ON external_qa_messages TO vault_app;

-- Down Migration

REVOKE UPDATE (status, reviewed_by_internal_user_id, reviewed_at)
  ON external_qa_messages FROM vault_app;
