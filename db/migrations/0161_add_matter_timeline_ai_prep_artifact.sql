-- Up Migration

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_candidates_check,
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_matter_timeline_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_artifact_kind_matter_timeline_check CHECK (
    artifact_kind IN (
      'document_profile',
      'key_fields',
      'date_facts',
      'matter_timeline',
      'people_organizations',
      'keyword_tags',
      'filing_suggestions',
      'source_outline',
      'retrieval_hints',
      'fact_candidates',
      'issue_candidates',
      'risk_candidates',
      'graph_candidate_edges'
    )
  );

CREATE OR REPLACE FUNCTION ai_prep_completed_payload_file_organization_allowed(
  payload jsonb,
  artifact_kind text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH source_refs AS (
    SELECT ref.value
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(payload->'source_refs') = 'array' THEN payload->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  ),
  claims AS (
    SELECT claim.value AS claim_json, claim.value->>'kind' AS claim_kind
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'claims') = 'array' THEN payload->'claims'
        ELSE '[]'::jsonb
      END
    ) AS claim(value)
  ),
  claim_source_refs AS (
    SELECT c.claim_json, ref.value AS source_ref
    FROM claims c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(c.claim_json->'source_refs') = 'array'
          THEN c.claim_json->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  ),
  sections AS (
    SELECT section.value AS section_json
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'sections') = 'array' THEN payload->'sections'
        ELSE '[]'::jsonb
      END
    ) AS section(value)
  ),
  section_source_refs AS (
    SELECT s.section_json, ref.value AS source_ref
    FROM sections s
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(s.section_json->'source_refs') = 'array'
          THEN s.section_json->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  )
  SELECT coalesce(
    jsonb_typeof(payload) = 'object'
    AND jsonb_typeof(payload->'answer') = 'string'
    AND char_length(payload->>'answer') BETWEEN 1 AND 6000
    AND CASE
      WHEN jsonb_typeof(payload->'source_refs') = 'array'
        THEN jsonb_array_length(payload->'source_refs') BETWEEN 1 AND 50
      ELSE false
    END
    AND CASE
      WHEN jsonb_typeof(payload->'claims') = 'array'
        THEN jsonb_array_length(payload->'claims') BETWEEN 1 AND 100
      ELSE false
    END
    AND CASE
      WHEN jsonb_typeof(payload->'sections') = 'array'
        THEN jsonb_array_length(payload->'sections') BETWEEN 1 AND 12
      ELSE false
    END
    AND NOT EXISTS (
      SELECT 1
      FROM source_refs sr
      WHERE sr.value IS NULL
        OR sr.value !~ '^chunk:[A-Za-z0-9:_-]+$'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM claims c
      WHERE c.claim_kind IS NULL
        OR c.claim_kind = 'clause'
        OR c.claim_json->>'is_legal_conclusion' = 'true'
        OR CASE
          WHEN jsonb_typeof(c.claim_json->'source_refs') = 'array'
            THEN jsonb_array_length(c.claim_json->'source_refs') = 0
          ELSE true
        END
        OR NOT coalesce((
          (artifact_kind = 'document_profile' AND c.claim_kind IN ('summary', 'key_fact'))
          OR (artifact_kind = 'key_fields' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'date_facts' AND c.claim_kind IN ('timeline', 'key_fact'))
          OR (artifact_kind = 'matter_timeline' AND c.claim_kind IN ('timeline', 'key_fact'))
          OR (artifact_kind = 'people_organizations' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'keyword_tags' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'filing_suggestions' AND c.claim_kind IN ('answer', 'key_fact'))
          OR (artifact_kind = 'source_outline' AND c.claim_kind IN ('summary', 'key_fact'))
          OR (artifact_kind = 'retrieval_hints' AND c.claim_kind IN ('question', 'answer', 'key_fact'))
          OR (artifact_kind = 'fact_candidates' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'issue_candidates' AND c.claim_kind = 'issue')
          OR (artifact_kind = 'risk_candidates' AND c.claim_kind = 'risk')
          OR (artifact_kind = 'graph_candidate_edges' AND c.claim_kind IN ('key_fact', 'issue', 'risk'))
        ), false)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM claim_source_refs cr
      WHERE cr.source_ref IS NULL
        OR cr.source_ref !~ '^chunk:[A-Za-z0-9:_-]+$'
        OR NOT EXISTS (
          SELECT 1
          FROM source_refs sr
          WHERE sr.value = cr.source_ref
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sections s
      WHERE CASE
        WHEN jsonb_typeof(s.section_json->'source_refs') = 'array'
          THEN jsonb_array_length(s.section_json->'source_refs') = 0
        ELSE true
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM section_source_refs sr
      WHERE sr.source_ref IS NULL
        OR sr.source_ref !~ '^chunk:[A-Za-z0-9:_-]+$'
        OR NOT EXISTS (
          SELECT 1
          FROM source_refs top_ref
          WHERE top_ref.value = sr.source_ref
        )
    ),
    false
  );
$$;

-- Down Migration

DELETE FROM ai_prep_artifacts
WHERE artifact_kind = 'matter_timeline';

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_matter_timeline_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_artifact_kind_candidates_check CHECK (
    artifact_kind IN (
      'document_profile',
      'key_fields',
      'date_facts',
      'people_organizations',
      'keyword_tags',
      'filing_suggestions',
      'source_outline',
      'retrieval_hints',
      'fact_candidates',
      'issue_candidates',
      'risk_candidates',
      'graph_candidate_edges'
    )
  );

CREATE OR REPLACE FUNCTION ai_prep_completed_payload_file_organization_allowed(
  payload jsonb,
  artifact_kind text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH source_refs AS (
    SELECT ref.value
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(payload->'source_refs') = 'array' THEN payload->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  ),
  claims AS (
    SELECT claim.value AS claim_json, claim.value->>'kind' AS claim_kind
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'claims') = 'array' THEN payload->'claims'
        ELSE '[]'::jsonb
      END
    ) AS claim(value)
  ),
  claim_source_refs AS (
    SELECT c.claim_json, ref.value AS source_ref
    FROM claims c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(c.claim_json->'source_refs') = 'array'
          THEN c.claim_json->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  ),
  sections AS (
    SELECT section.value AS section_json
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(payload->'sections') = 'array' THEN payload->'sections'
        ELSE '[]'::jsonb
      END
    ) AS section(value)
  ),
  section_source_refs AS (
    SELECT s.section_json, ref.value AS source_ref
    FROM sections s
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(s.section_json->'source_refs') = 'array'
          THEN s.section_json->'source_refs'
        ELSE '[]'::jsonb
      END
    ) AS ref(value)
  )
  SELECT coalesce(
    jsonb_typeof(payload) = 'object'
    AND jsonb_typeof(payload->'answer') = 'string'
    AND char_length(payload->>'answer') BETWEEN 1 AND 6000
    AND CASE
      WHEN jsonb_typeof(payload->'source_refs') = 'array'
        THEN jsonb_array_length(payload->'source_refs') BETWEEN 1 AND 50
      ELSE false
    END
    AND CASE
      WHEN jsonb_typeof(payload->'claims') = 'array'
        THEN jsonb_array_length(payload->'claims') BETWEEN 1 AND 100
      ELSE false
    END
    AND CASE
      WHEN jsonb_typeof(payload->'sections') = 'array'
        THEN jsonb_array_length(payload->'sections') BETWEEN 1 AND 12
      ELSE false
    END
    AND NOT EXISTS (
      SELECT 1
      FROM source_refs sr
      WHERE sr.value IS NULL
        OR sr.value !~ '^chunk:[A-Za-z0-9:_-]+$'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM claims c
      WHERE c.claim_kind IS NULL
        OR c.claim_kind = 'clause'
        OR c.claim_json->>'is_legal_conclusion' = 'true'
        OR CASE
          WHEN jsonb_typeof(c.claim_json->'source_refs') = 'array'
            THEN jsonb_array_length(c.claim_json->'source_refs') = 0
          ELSE true
        END
        OR NOT coalesce((
          (artifact_kind = 'document_profile' AND c.claim_kind IN ('summary', 'key_fact'))
          OR (artifact_kind = 'key_fields' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'date_facts' AND c.claim_kind IN ('timeline', 'key_fact'))
          OR (artifact_kind = 'people_organizations' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'keyword_tags' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'filing_suggestions' AND c.claim_kind IN ('answer', 'key_fact'))
          OR (artifact_kind = 'source_outline' AND c.claim_kind IN ('summary', 'key_fact'))
          OR (artifact_kind = 'retrieval_hints' AND c.claim_kind IN ('question', 'answer', 'key_fact'))
          OR (artifact_kind = 'fact_candidates' AND c.claim_kind = 'key_fact')
          OR (artifact_kind = 'issue_candidates' AND c.claim_kind = 'issue')
          OR (artifact_kind = 'risk_candidates' AND c.claim_kind = 'risk')
          OR (artifact_kind = 'graph_candidate_edges' AND c.claim_kind IN ('key_fact', 'issue', 'risk'))
        ), false)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM claim_source_refs cr
      WHERE cr.source_ref IS NULL
        OR cr.source_ref !~ '^chunk:[A-Za-z0-9:_-]+$'
        OR NOT EXISTS (
          SELECT 1
          FROM source_refs sr
          WHERE sr.value = cr.source_ref
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sections s
      WHERE CASE
        WHEN jsonb_typeof(s.section_json->'source_refs') = 'array'
          THEN jsonb_array_length(s.section_json->'source_refs') = 0
        ELSE true
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM section_source_refs sr
      WHERE sr.source_ref IS NULL
        OR sr.source_ref !~ '^chunk:[A-Za-z0-9:_-]+$'
        OR NOT EXISTS (
          SELECT 1
          FROM source_refs top_ref
          WHERE top_ref.value = sr.source_ref
        )
    ),
    false
  );
$$;
