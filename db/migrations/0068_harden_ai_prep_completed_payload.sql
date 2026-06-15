-- Up Migration

CREATE FUNCTION ai_prep_completed_payload_file_organization_allowed(
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
        OR c.claim_kind IN ('risk', 'issue', 'clause')
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

ALTER TABLE ai_prep_artifacts
  ADD CONSTRAINT ai_prep_artifacts_completed_payload_file_org_check
  CHECK (
    status <> 'completed'
    OR ai_prep_completed_payload_file_organization_allowed(payload_json, artifact_kind)
  ) NOT VALID;

COMMENT ON CONSTRAINT ai_prep_artifacts_completed_payload_file_org_check
  ON ai_prep_artifacts IS
  'Completed AI prep payloads must remain file-organization-only: allowed claim kinds, chunk refs, no legal conclusions.';

-- Down Migration

ALTER TABLE ai_prep_artifacts
  DROP CONSTRAINT IF EXISTS ai_prep_artifacts_completed_payload_file_org_check;

DROP FUNCTION IF EXISTS ai_prep_completed_payload_file_organization_allowed(jsonb, text);
