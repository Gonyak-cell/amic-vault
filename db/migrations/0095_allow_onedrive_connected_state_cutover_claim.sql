-- Up Migration

ALTER TABLE onedrive_source_cutovers
  DROP CONSTRAINT IF EXISTS onedrive_source_cutovers_onedrive_connected_state_claimed_check;

GRANT UPDATE (onedrive_connected_state_claimed) ON onedrive_source_cutovers TO vault_app;

COMMENT ON COLUMN onedrive_source_cutovers.onedrive_connected_state_claimed IS
  'Set true only by the approved OneDrive connected-state claim receipt after source-of-truth cutover and connected-state verification pass.';

-- Down Migration

UPDATE onedrive_source_cutovers
SET onedrive_connected_state_claimed = false
WHERE onedrive_connected_state_claimed = true;

REVOKE UPDATE (onedrive_connected_state_claimed) ON onedrive_source_cutovers FROM vault_app;

ALTER TABLE onedrive_source_cutovers
  ADD CONSTRAINT onedrive_source_cutovers_onedrive_connected_state_claimed_check
  CHECK (onedrive_connected_state_claimed = false);
