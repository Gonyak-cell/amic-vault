-- Up Migration

ALTER TABLE document_search_index
  ADD COLUMN extraction_confidence numeric(4,3) CHECK (
    extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
  ),
  ADD COLUMN ocr_low_confidence boolean NOT NULL DEFAULT false;

UPDATE document_search_index idx
SET extraction_confidence = cd.confidence,
    ocr_low_confidence = cd.extraction_method = 'ocr' AND cd.confidence < 0.8,
    updated_at = now()
FROM canonical_documents cd
WHERE cd.tenant_id = idx.tenant_id
  AND cd.version_id = idx.version_id;

CREATE INDEX idx_document_search_index_tenant_ocr_low_confidence
  ON document_search_index (tenant_id, ocr_low_confidence, version_status)
  WHERE ocr_low_confidence = true;

GRANT UPDATE (extraction_confidence, ocr_low_confidence)
  ON document_search_index TO vault_app;

COMMENT ON COLUMN document_search_index.extraction_confidence IS
  'Canonical extraction confidence copied for governed OCR review filters; no document body text.';

COMMENT ON COLUMN document_search_index.ocr_low_confidence IS
  'True when extraction_method=ocr and confidence is below 0.8, used for OCR review search facets.';

ALTER TABLE enterprise_dms_search_refiners
  DROP CONSTRAINT IF EXISTS enterprise_dms_search_refiners_field_key_supported;

ALTER TABLE enterprise_dms_search_refiners
  ADD CONSTRAINT enterprise_dms_search_refiners_field_key_supported
  CHECK (
    field_key IN (
      'client',
      'client_name',
      'confidentiality_level',
      'document_type',
      'extraction_status',
      'ocr_confidence',
      'legal_hold',
      'matter',
      'matter_code',
      'matter_name',
      'privilege_status',
      'records_status',
      'title',
      'updated_at',
      'version_status'
    )
  ) NOT VALID;

-- Down Migration

ALTER TABLE enterprise_dms_search_refiners
  DROP CONSTRAINT IF EXISTS enterprise_dms_search_refiners_field_key_supported;

ALTER TABLE enterprise_dms_search_refiners
  ADD CONSTRAINT enterprise_dms_search_refiners_field_key_supported
  CHECK (
    field_key IN (
      'client',
      'client_name',
      'confidentiality_level',
      'document_type',
      'extraction_status',
      'legal_hold',
      'matter',
      'matter_code',
      'matter_name',
      'privilege_status',
      'records_status',
      'title',
      'updated_at',
      'version_status'
    )
  ) NOT VALID;

DROP INDEX IF EXISTS idx_document_search_index_tenant_ocr_low_confidence;

ALTER TABLE document_search_index
  DROP COLUMN IF EXISTS ocr_low_confidence,
  DROP COLUMN IF EXISTS extraction_confidence;
