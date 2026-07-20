-- Up Migration

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN ('pending', 'pdf_text', 'docx', 'hwpx', 'ocr', 'ocr_required', 'failed')
  );

-- Down Migration

UPDATE canonical_documents
SET extraction_method = 'ocr_required',
    extraction_status = CASE WHEN extraction_status = 'ready' THEN 'ocr_pending' ELSE extraction_status END,
    body_text = CASE WHEN extraction_method = 'ocr' THEN '' ELSE body_text END,
    confidence = CASE WHEN extraction_method = 'ocr' THEN 0 ELSE confidence END,
    extracted_at = CASE WHEN extraction_method = 'ocr' THEN NULL ELSE extracted_at END,
    updated_at = now()
WHERE extraction_method = 'ocr';

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN ('pending', 'pdf_text', 'docx', 'hwpx', 'ocr_required', 'failed')
  );
