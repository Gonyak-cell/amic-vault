-- Up Migration

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN (
      'pending',
      'pdf_text',
      'docx',
      'doc',
      'hwpx',
      'hwp5',
      'email',
      'text',
      'csv',
      'markdown',
      'html',
      'xlsx',
      'xls',
      'pptx',
      'ppt',
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
  failure_reason_code = 'HWP5_METHOD_ROLLBACK',
  updated_at = now()
WHERE extraction_method = 'hwp5';

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN (
      'pending',
      'pdf_text',
      'docx',
      'doc',
      'hwpx',
      'email',
      'text',
      'csv',
      'markdown',
      'html',
      'xlsx',
      'xls',
      'pptx',
      'ppt',
      'ocr',
      'ocr_required',
      'failed'
    )
  );
