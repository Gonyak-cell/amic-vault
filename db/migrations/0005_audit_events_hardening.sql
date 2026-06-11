-- Up Migration

CREATE INDEX idx_audit_events_tenant_created ON audit_events (tenant_id, created_at DESC);
CREATE INDEX idx_audit_events_tenant_target ON audit_events (tenant_id, target_type, target_id);
CREATE INDEX idx_audit_events_tenant_actor_created ON audit_events (tenant_id, actor_id, created_at DESC);
CREATE INDEX idx_audit_events_tenant_action ON audit_events (tenant_id, action);
CREATE INDEX idx_audit_events_tenant_matter ON audit_events (tenant_id, matter_id) WHERE matter_id IS NOT NULL;

COMMENT ON TABLE audit_events IS
  'Append-only tenant audit log. Runtime code may insert and read rows only; updates, deletes, and truncates are blocked in the database.';

-- Down Migration

COMMENT ON TABLE audit_events IS NULL;
DROP INDEX IF EXISTS idx_audit_events_tenant_matter;
DROP INDEX IF EXISTS idx_audit_events_tenant_action;
DROP INDEX IF EXISTS idx_audit_events_tenant_actor_created;
DROP INDEX IF EXISTS idx_audit_events_tenant_target;
DROP INDEX IF EXISTS idx_audit_events_tenant_created;
