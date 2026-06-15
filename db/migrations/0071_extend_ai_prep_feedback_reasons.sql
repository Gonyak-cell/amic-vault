-- Up Migration

ALTER TABLE ai_prep_feedback_items
  DROP CONSTRAINT IF EXISTS ai_prep_feedback_items_reason_code_organization_check;

ALTER TABLE ai_prep_feedback_items
  DROP CONSTRAINT IF EXISTS ai_prep_feedback_items_reason_code_check;

ALTER TABLE ai_prep_feedback_items
  ADD CONSTRAINT ai_prep_feedback_items_reason_code_organization_check CHECK (
    reason_code IN (
      'useful',
      'incorrect_profile',
      'incorrect_fields',
      'incorrect_tags',
      'incorrect_filing_suggestion',
      'missing_citation',
      'missing_source_ref',
      'stale_artifact',
      'rejected_output',
      'permission_concern',
      'other_structured'
    )
  );

COMMENT ON CONSTRAINT ai_prep_feedback_items_reason_code_organization_check
  ON ai_prep_feedback_items IS
  'AI prep feedback uses bounded file-organization reason codes only; no free-form document comments are stored.';

-- Down Migration

ALTER TABLE ai_prep_feedback_items
  DROP CONSTRAINT IF EXISTS ai_prep_feedback_items_reason_code_organization_check;

UPDATE ai_prep_feedback_items
SET reason_code = 'other_structured'
WHERE reason_code IN ('missing_source_ref', 'rejected_output');

ALTER TABLE ai_prep_feedback_items
  ADD CONSTRAINT ai_prep_feedback_items_reason_code_organization_check CHECK (
    reason_code IN (
      'useful',
      'incorrect_profile',
      'incorrect_fields',
      'incorrect_tags',
      'incorrect_filing_suggestion',
      'missing_citation',
      'stale_artifact',
      'permission_concern',
      'other_structured'
    )
  );
