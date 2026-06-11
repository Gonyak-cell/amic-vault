-- Up Migration

-- R0 Gate treats every public table except explicitly global references as
-- requiring an RLS posture. schema_migrations is global migration metadata:
-- it has no tenant rows, and only the migration owner should read or mutate it.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_schema_migrations_owner_only ON schema_migrations
  FOR ALL
  USING (current_user = 'amic_vault')
  WITH CHECK (current_user = 'amic_vault');

COMMENT ON TABLE schema_migrations IS
  'RLS-protected global migration metadata; owner-only access, no tenant data.';

-- Down Migration

COMMENT ON TABLE schema_migrations IS NULL;
DROP POLICY IF EXISTS rls_schema_migrations_owner_only ON schema_migrations;
ALTER TABLE schema_migrations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations DISABLE ROW LEVEL SECURITY;
