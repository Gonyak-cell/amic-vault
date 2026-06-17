-- Up Migration

-- Password reset confirmation may activate a pre-provisioned inactive user.
-- The runtime role already updates password_hash for reset flows; this grants
-- only the additional bounded status transition required for activation.
GRANT UPDATE (status) ON users TO vault_app;

-- Down Migration

REVOKE UPDATE (status) ON users FROM vault_app;
