-- Up Migration

ALTER TABLE onedrive_source_cutovers
  DROP CONSTRAINT IF EXISTS onedrive_source_cutovers_office_open_save_sync_claimed_check;

GRANT UPDATE (office_open_save_sync_claimed) ON onedrive_source_cutovers TO vault_app;

COMMENT ON COLUMN onedrive_source_cutovers.office_open_save_sync_claimed IS
  'Set true only by the approved Office open/save/sync claim receipt after source-of-truth cutover and Office verification pass.';

-- Down Migration

UPDATE onedrive_source_cutovers
SET office_open_save_sync_claimed = false
WHERE office_open_save_sync_claimed = true;

REVOKE UPDATE (office_open_save_sync_claimed) ON onedrive_source_cutovers FROM vault_app;

ALTER TABLE onedrive_source_cutovers
  ADD CONSTRAINT onedrive_source_cutovers_office_open_save_sync_claimed_check
  CHECK (office_open_save_sync_claimed = false);
