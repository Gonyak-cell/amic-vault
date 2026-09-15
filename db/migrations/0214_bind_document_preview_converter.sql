-- Up Migration

-- Legacy derivatives remain retained, but cannot satisfy a bound cache lookup.
ALTER TABLE document_preview_artifacts
  ADD COLUMN source_sha256 text,
  ADD COLUMN converter_profile_sha256 text,
  ADD CONSTRAINT document_preview_artifacts_converter_binding_check CHECK (
    (source_sha256 IS NULL AND converter_profile_sha256 IS NULL)
    OR (source_sha256 IS NOT NULL AND converter_profile_sha256 IS NOT NULL
      AND source_sha256 ~ '^[a-f0-9]{64}$'
      AND converter_profile_sha256 ~ '^[a-f0-9]{64}$')
  );

-- Down Migration

ALTER TABLE document_preview_artifacts
  DROP CONSTRAINT document_preview_artifacts_converter_binding_check,
  DROP COLUMN converter_profile_sha256,
  DROP COLUMN source_sha256;
