-- Up Migration

-- Role assignment is an audited, tenant-scoped runtime workflow. The runtime
-- role already has SELECT/INSERT and narrower user-column updates; preserve
-- RLS and grant only the missing role column needed by UserRoleService.
GRANT UPDATE (role) ON users TO vault_app;

-- Down Migration

REVOKE UPDATE (role) ON users FROM vault_app;
