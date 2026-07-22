-- Up Migration
-- The existing audited Matter-close workflow reopens its tenant-scoped work item.
-- RLS/policies, workflow constraints, and all other columns remain unchanged.
GRANT UPDATE (assignment_scope) ON work_items TO vault_app;

-- Down Migration
REVOKE UPDATE (assignment_scope) ON work_items FROM vault_app;
