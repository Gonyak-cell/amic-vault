-- Up Migration

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN (
      'pending',
      'pdf_text',
      'docx',
      'hwpx',
      'email',
      'text',
      'csv',
      'markdown',
      'html',
      'ocr',
      'ocr_required',
      'failed'
    )
  );

-- Down Migration

UPDATE canonical_documents
SET extraction_status = 'failed',
    extraction_method = 'failed',
    body_text = '',
    confidence = 0,
    failure_reason_code = 'ROLLBACK_UNSUPPORTED_EXTRACTION_METHOD',
    extracted_at = NULL,
    updated_at = now()
WHERE extraction_method IN ('text', 'csv', 'markdown', 'html');

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN (
      'pending',
      'pdf_text',
      'docx',
      'hwpx',
      'email',
      'ocr',
      'ocr_required',
      'failed'
    )
  );
