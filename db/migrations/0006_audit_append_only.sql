-- Up Migration

CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_block_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();

CREATE TRIGGER trg_audit_events_block_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM vault_app;
GRANT SELECT, INSERT ON audit_events TO vault_app;

-- Down Migration

DROP TRIGGER IF EXISTS trg_audit_events_block_truncate ON audit_events;
DROP TRIGGER IF EXISTS trg_audit_events_block_update_delete ON audit_events;
DROP FUNCTION IF EXISTS audit_events_block_mutation();
