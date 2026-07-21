-- Up Migration

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_matter_timeline_check,
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_minutes_qc_check;

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_artifact_kind_minutes_qc_check CHECK (
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
      'graph_candidate_edges',
      'minutes_qc'
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
  WITH allowed_claim_kinds AS (
    SELECT *
    FROM (VALUES
      ('document_profile', ARRAY['summary', 'key_fact']::text[]),
      ('key_fields', ARRAY['key_fact']::text[]),
      ('date_facts', ARRAY['timeline', 'key_fact']::text[]),
      ('matter_timeline', ARRAY['timeline', 'key_fact']::text[]),
      ('people_organizations', ARRAY['key_fact']::text[]),
      ('keyword_tags', ARRAY['key_fact']::text[]),
      ('filing_suggestions', ARRAY['answer', 'key_fact']::text[]),
      ('source_outline', ARRAY['summary', 'key_fact']::text[]),
      ('retrieval_hints', ARRAY['question', 'answer', 'key_fact']::text[]),
      ('fact_candidates', ARRAY['key_fact']::text[]),
      ('issue_candidates', ARRAY['issue']::text[]),
      ('risk_candidates', ARRAY['risk']::text[]),
      ('graph_candidate_edges', ARRAY['key_fact', 'issue', 'risk']::text[]),
      ('minutes_qc', ARRAY['key_fact']::text[])
    ) AS allowed(allowed_artifact_kind, claim_kinds)
  ),
  source_refs AS (
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
    AND EXISTS (
      SELECT 1
      FROM allowed_claim_kinds allowed
      WHERE allowed.allowed_artifact_kind = artifact_kind
    )
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
        OR NOT EXISTS (
          SELECT 1
          FROM allowed_claim_kinds allowed
          WHERE allowed.allowed_artifact_kind = artifact_kind
            AND c.claim_kind = ANY(allowed.claim_kinds)
        )
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

DELETE FROM work_items
WHERE source = 'ai_prep'
  AND target_type = 'ai_prep_artifact'
  AND target_id IN (
    SELECT ai_prep_artifact_id
    FROM ai_prep_artifacts
    WHERE artifact_kind = 'minutes_qc'
  );

DELETE FROM ai_prep_artifacts
WHERE artifact_kind = 'minutes_qc';

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_artifact_kind_minutes_qc_check;

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
  WITH allowed_claim_kinds AS (
    SELECT *
    FROM (VALUES
      ('document_profile', ARRAY['summary', 'key_fact']::text[]),
      ('key_fields', ARRAY['key_fact']::text[]),
      ('date_facts', ARRAY['timeline', 'key_fact']::text[]),
      ('matter_timeline', ARRAY['timeline', 'key_fact']::text[]),
      ('people_organizations', ARRAY['key_fact']::text[]),
      ('keyword_tags', ARRAY['key_fact']::text[]),
      ('filing_suggestions', ARRAY['answer', 'key_fact']::text[]),
      ('source_outline', ARRAY['summary', 'key_fact']::text[]),
      ('retrieval_hints', ARRAY['question', 'answer', 'key_fact']::text[]),
      ('fact_candidates', ARRAY['key_fact']::text[]),
      ('issue_candidates', ARRAY['issue']::text[]),
      ('risk_candidates', ARRAY['risk']::text[]),
      ('graph_candidate_edges', ARRAY['key_fact', 'issue', 'risk']::text[])
    ) AS allowed(allowed_artifact_kind, claim_kinds)
  ),
  source_refs AS (
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
    AND EXISTS (
      SELECT 1
      FROM allowed_claim_kinds allowed
      WHERE allowed.allowed_artifact_kind = artifact_kind
    )
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
        OR NOT EXISTS (
          SELECT 1
          FROM allowed_claim_kinds allowed
          WHERE allowed.allowed_artifact_kind = artifact_kind
            AND c.claim_kind = ANY(allowed.claim_kinds)
        )
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
