-- Up Migration

ALTER TABLE evaluation_cases
  ADD COLUMN expected_answer_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN expected_citation_document_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE evaluation_cases
  ADD CONSTRAINT chk_evaluation_cases_expected_answer_facts_array
    CHECK (jsonb_typeof(expected_answer_facts) = 'array');

GRANT UPDATE (
  expected_answer_facts,
  expected_citation_document_ids
) ON evaluation_cases TO vault_app;

COMMENT ON COLUMN evaluation_cases.expected_answer_facts IS
  'Deidentified golden answer facts used by the local AI evaluation gate.';

COMMENT ON COLUMN evaluation_cases.expected_citation_document_ids IS
  'Expected authorized document ids for citation-set comparison in the local AI evaluation gate.';

-- Down Migration

ALTER TABLE evaluation_cases
  DROP CONSTRAINT IF EXISTS chk_evaluation_cases_expected_answer_facts_array,
  DROP COLUMN IF EXISTS expected_citation_document_ids,
  DROP COLUMN IF EXISTS expected_answer_facts;
