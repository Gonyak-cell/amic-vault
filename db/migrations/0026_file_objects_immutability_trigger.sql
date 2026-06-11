-- Up Migration

CREATE OR REPLACE FUNCTION file_objects_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'file_objects immutable original row: % blocked', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_file_objects_block_update_delete
  BEFORE UPDATE OR DELETE ON file_objects
  FOR EACH ROW EXECUTE FUNCTION file_objects_block_mutation();

REVOKE UPDATE, DELETE ON file_objects FROM PUBLIC;
REVOKE UPDATE, DELETE ON file_objects FROM vault_app;
GRANT SELECT, INSERT ON file_objects TO vault_app;

COMMENT ON TABLE file_objects IS
  'Immutable original object records. New versions must create new file_objects rows; UPDATE/DELETE is blocked by trigger.';

-- Down Migration

COMMENT ON TABLE file_objects IS NULL;
DROP TRIGGER IF EXISTS trg_file_objects_block_update_delete ON file_objects;
DROP FUNCTION IF EXISTS file_objects_block_mutation();
