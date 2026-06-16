-- Up Migration

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_stale_reason_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_stale_reason_check CHECK (
    stale_reason IS NULL
    OR stale_reason IN (
      'new_version',
      'document_metadata_changed',
      'document_ai_disabled',
      'document_ai_enabled',
      'matter_ai_policy_changed',
      'ai_policy_parse_failed',
      'permission_changed',
      'ethical_wall_changed',
      'source_chunks_changed',
      'source_hash_changed',
      'operator_retry',
      'operator_rebuild',
      'operator_reprocess_fallback',
      'operator_reprocess_rejected'
    )
  );

COMMENT ON CONSTRAINT ai_prep_artifacts_stale_reason_check ON ai_prep_artifacts IS
  'AI prep stale reasons are bounded reference codes; free-form reason text is not stored.';

-- Down Migration

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_stale_reason_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_stale_reason_check CHECK (
    stale_reason IS NULL OR char_length(stale_reason) BETWEEN 1 AND 120
  );
