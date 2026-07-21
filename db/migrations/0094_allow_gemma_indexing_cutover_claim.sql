-- Up Migration

ALTER TABLE onedrive_source_cutovers
  DROP CONSTRAINT IF EXISTS onedrive_source_cutovers_gemma_indexing_executed_check;

GRANT UPDATE (gemma_indexing_executed) ON onedrive_source_cutovers TO vault_app;

COMMENT ON COLUMN onedrive_source_cutovers.gemma_indexing_executed IS
  'Set true only by the approved Gemma indexing execute receipt after source-of-truth cutover and full extraction/search/Gemma reconciliation pass.';

-- Down Migration

UPDATE onedrive_source_cutovers
SET gemma_indexing_executed = false
WHERE gemma_indexing_executed = true;

REVOKE UPDATE (gemma_indexing_executed) ON onedrive_source_cutovers FROM vault_app;

ALTER TABLE onedrive_source_cutovers
  ADD CONSTRAINT onedrive_source_cutovers_gemma_indexing_executed_check
  CHECK (gemma_indexing_executed = false);
