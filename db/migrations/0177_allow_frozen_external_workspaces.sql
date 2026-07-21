-- Up Migration
ALTER TABLE external_workspaces
  DROP CONSTRAINT IF EXISTS external_workspaces_status_check;

ALTER TABLE external_workspaces
  ADD CONSTRAINT external_workspaces_status_check
  CHECK (status IN ('active', 'suspended', 'closed', 'frozen'));

-- Down Migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM external_workspaces WHERE status = 'frozen') THEN
    RAISE EXCEPTION 'cannot remove frozen external workspace status while rows exist';
  END IF;
END $$;

ALTER TABLE external_workspaces
  DROP CONSTRAINT IF EXISTS external_workspaces_status_check;

ALTER TABLE external_workspaces
  ADD CONSTRAINT external_workspaces_status_check
  CHECK (status IN ('active', 'suspended', 'closed'));
