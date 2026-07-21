-- Up Migration

-- Existing AI-prep candidate-review upserts restore assignment_scope when
-- reopening an item. Preserve RLS and grant only that already-written column.
GRANT UPDATE (assignment_scope) ON work_items TO vault_app;

-- Down Migration

REVOKE UPDATE (assignment_scope) ON work_items FROM vault_app;
