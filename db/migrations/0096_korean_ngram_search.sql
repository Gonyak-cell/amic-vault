-- Up Migration

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION amic_korean_search_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        replace(replace(replace(lower(input), 'm&a', 'ma'), '엠앤에이', 'ma'), '및', ''),
        '([가-힣])(에서|에게|으로|부터|까지|보다|은|는|이|가|을|를|의|과|와|도|만|에|로|께)([^가-힣]|$)',
        '\1\3',
        'g'
      ),
      '(한다|하였다|합니다|했다|된다|되는|하여|하고|하는|하다|된|한|할)$',
      '',
      'g'
    ),
    '[^0-9a-z가-힣]+',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION amic_korean_search_match(body_text text, query_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  WITH normalized AS (
    SELECT
      amic_korean_search_normalize(body_text) AS haystack,
      amic_korean_search_normalize(query_text) AS needle
  )
  SELECT CASE
    WHEN needle = '' THEN false
    WHEN char_length(needle) <= 2 AND needle ~ '^[가-힣]+$' THEN
      lower(body_text) ~ ('(^|[^가-힣])' || needle || '([^가-힣]|$)')
    ELSE position(needle in haystack) > 0
  END
  FROM normalized;
$$;

ALTER TABLE document_search_index
  DROP CONSTRAINT IF EXISTS document_search_index_fts_config_check;

ALTER TABLE document_search_index
  ADD CONSTRAINT document_search_index_fts_config_check CHECK (
    fts_config IN ('simple', 'korean_ngram')
  );

CREATE INDEX idx_document_search_index_title_korean_ngram
  ON document_search_index
  USING gin (amic_korean_search_normalize(title) gin_trgm_ops);

CREATE INDEX idx_document_search_index_content_korean_ngram
  ON document_search_index
  USING gin (amic_korean_search_normalize(content_text) gin_trgm_ops);

COMMENT ON FUNCTION amic_korean_search_normalize(text) IS
  'Internal Korean search normalization for Postgres-bound n-gram fallback. Removes common particles, spacing, and punctuation without logging document text.';

COMMENT ON FUNCTION amic_korean_search_match(text, text) IS
  'Boolean helper for the Korean legal-term evaluation harness. Application search uses the same normalization plus query-stage permission filters.';

COMMENT ON COLUMN document_search_index.fts_config IS
  'simple keeps PostgreSQL FTS compatibility; korean_ngram marks rows eligible for the Postgres trigram-backed Korean normalization fallback.';

-- Down Migration

DROP INDEX IF EXISTS idx_document_search_index_content_korean_ngram;
DROP INDEX IF EXISTS idx_document_search_index_title_korean_ngram;

UPDATE document_search_index
SET fts_config = 'simple'
WHERE fts_config <> 'simple';

ALTER TABLE document_search_index
  DROP CONSTRAINT IF EXISTS document_search_index_fts_config_check;

ALTER TABLE document_search_index
  ADD CONSTRAINT document_search_index_fts_config_check CHECK (fts_config = 'simple');

DROP FUNCTION IF EXISTS amic_korean_search_match(text, text);
DROP FUNCTION IF EXISTS amic_korean_search_normalize(text);

COMMENT ON COLUMN document_search_index.fts_config IS
  'R3 starts with PostgreSQL simple config. Korean quality is measured in PACK-R3-03 before any OpenSearch transition decision.';
