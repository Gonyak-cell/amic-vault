-- Up Migration

ALTER TABLE onedrive_source_cutovers
  ADD COLUMN IF NOT EXISTS customer_wide_go_live_claimed boolean NOT NULL DEFAULT false;

GRANT UPDATE (customer_wide_go_live_claimed) ON onedrive_source_cutovers TO vault_app;

COMMENT ON COLUMN onedrive_source_cutovers.customer_wide_go_live_claimed IS
  'Set true only by the approved customer-wide go-live claim receipt after source-of-truth cutover, Gemma indexing, OneDrive connected-state, and Office open/save/sync gates pass.';

-- Down Migration

UPDATE onedrive_source_cutovers
SET customer_wide_go_live_claimed = false
WHERE customer_wide_go_live_claimed = true;

REVOKE UPDATE (customer_wide_go_live_claimed) ON onedrive_source_cutovers FROM vault_app;

ALTER TABLE onedrive_source_cutovers
  DROP COLUMN IF EXISTS customer_wide_go_live_claimed;
