-- Up Migration

ALTER TABLE document_preview_artifacts
  DROP CONSTRAINT document_preview_artifacts_status_check,
  DROP CONSTRAINT document_preview_artifacts_check,
  ADD CONSTRAINT document_preview_artifacts_status_check
    CHECK (status IN ('pending', 'ready', 'failed')),
  ADD CONSTRAINT document_preview_artifacts_check CHECK (
    (status IN ('pending', 'ready') AND failure_reason_code IS NULL)
    OR (status = 'failed' AND failure_reason_code IS NOT NULL)
  );

-- Down Migration

UPDATE document_preview_artifacts
SET status = 'failed', failure_reason_code = 'PREVIEW_CONVERSION_UNAVAILABLE'
WHERE status = 'pending';

ALTER TABLE document_preview_artifacts
  DROP CONSTRAINT document_preview_artifacts_status_check,
  DROP CONSTRAINT document_preview_artifacts_check,
  ADD CONSTRAINT document_preview_artifacts_status_check
    CHECK (status IN ('ready', 'failed')),
  ADD CONSTRAINT document_preview_artifacts_check CHECK (
    (status = 'ready' AND failure_reason_code IS NULL)
    OR (status = 'failed' AND failure_reason_code IS NOT NULL)
  );
