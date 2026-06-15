-- Up Migration

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_prep_artifacts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%artifact_kind%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_prep_artifacts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE ai_prep_artifacts
SET artifact_kind = CASE artifact_kind
  WHEN 'document_brief' THEN 'document_profile'
  WHEN 'key_terms' THEN 'keyword_tags'
  WHEN 'issue_candidates' THEN 'key_fields'
  WHEN 'risk_candidates' THEN 'filing_suggestions'
  WHEN 'timeline_candidates' THEN 'date_facts'
  WHEN 'clause_pointers' THEN 'source_outline'
  WHEN 'suggested_questions' THEN 'retrieval_hints'
  ELSE artifact_kind
END
WHERE artifact_kind IN (
  'document_brief',
  'key_terms',
  'issue_candidates',
  'risk_candidates',
  'timeline_candidates',
  'clause_pointers',
  'suggested_questions'
);

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_artifact_kind_organization_check CHECK (
    artifact_kind IN (
      'document_profile',
      'key_fields',
      'date_facts',
      'people_organizations',
      'keyword_tags',
      'filing_suggestions',
      'source_outline',
      'retrieval_hints'
    )
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_prep_feedback_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%reason_code%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_prep_feedback_items DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE ai_prep_feedback_items
SET reason_code = CASE reason_code
  WHEN 'incorrect_summary' THEN 'incorrect_profile'
  WHEN 'incorrect_key_terms' THEN 'incorrect_tags'
  WHEN 'incorrect_risk' THEN 'incorrect_filing_suggestion'
  ELSE reason_code
END
WHERE reason_code IN ('incorrect_summary', 'incorrect_key_terms', 'incorrect_risk');

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

COMMENT ON TABLE ai_prep_artifacts IS
  'Local-only post-upload AI preparation artifacts. Payloads store bounded file-organization outputs and hashes, never legal analysis, raw source text, prompts, or raw model responses.';

-- Down Migration

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_prep_feedback_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%reason_code%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_prep_feedback_items DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE ai_prep_feedback_items
SET reason_code = CASE reason_code
  WHEN 'incorrect_profile' THEN 'incorrect_summary'
  WHEN 'incorrect_tags' THEN 'incorrect_key_terms'
  WHEN 'incorrect_filing_suggestion' THEN 'incorrect_risk'
  WHEN 'incorrect_fields' THEN 'other_structured'
  ELSE reason_code
END
WHERE reason_code IN (
  'incorrect_profile',
  'incorrect_fields',
  'incorrect_tags',
  'incorrect_filing_suggestion'
);

ALTER TABLE ai_prep_feedback_items
  ADD CONSTRAINT ai_prep_feedback_items_reason_code_check CHECK (
    reason_code IN (
      'useful',
      'incorrect_summary',
      'incorrect_key_terms',
      'incorrect_risk',
      'missing_citation',
      'stale_artifact',
      'permission_concern',
      'other_structured'
    )
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_prep_artifacts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%artifact_kind%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_prep_artifacts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE ai_prep_artifacts
SET artifact_kind = CASE artifact_kind
  WHEN 'document_profile' THEN 'document_brief'
  WHEN 'keyword_tags' THEN 'key_terms'
  WHEN 'key_fields' THEN 'issue_candidates'
  WHEN 'filing_suggestions' THEN 'risk_candidates'
  WHEN 'date_facts' THEN 'timeline_candidates'
  WHEN 'source_outline' THEN 'clause_pointers'
  WHEN 'retrieval_hints' THEN 'suggested_questions'
  WHEN 'people_organizations' THEN 'suggested_questions'
  ELSE artifact_kind
END
WHERE artifact_kind IN (
  'document_profile',
  'key_fields',
  'date_facts',
  'people_organizations',
  'keyword_tags',
  'filing_suggestions',
  'source_outline',
  'retrieval_hints'
);

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_artifact_kind_check CHECK (
    artifact_kind IN (
      'document_brief',
      'key_terms',
      'issue_candidates',
      'risk_candidates',
      'timeline_candidates',
      'clause_pointers',
      'suggested_questions'
    )
  );

COMMENT ON TABLE ai_prep_artifacts IS
  'Local-only post-upload AI preparation artifacts. Payloads store bounded grounded outputs and hashes, never raw source text, prompts, or raw model responses.';
