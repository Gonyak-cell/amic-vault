-- Up Migration
-- Existing audited tenant-scoped role assignment executes through vault_app.
-- RLS remains the row-isolation authority; this grants only the written column.
GRANT UPDATE (role) ON users TO vault_app;

-- Down Migration
REVOKE UPDATE (role) ON users FROM vault_app;
