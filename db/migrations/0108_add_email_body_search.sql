-- Up Migration

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'contract',
      'memo',
      'opinion',
      'court_filing',
      'evidence',
      'email',
      'correspondence',
      'corporate_record',
      'financial',
      'other'
    )
  );

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN ('pending', 'pdf_text', 'docx', 'hwpx', 'email', 'ocr', 'ocr_required', 'failed')
  );

ALTER TABLE email_matter_filings
  ADD COLUMN body_document_id uuid;

ALTER TABLE email_matter_filings
  ADD CONSTRAINT fk_email_matter_filings_body_document
    FOREIGN KEY (tenant_id, body_document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_email_matter_filings_body_document
  ON email_matter_filings (tenant_id, body_document_id)
  WHERE body_document_id IS NOT NULL;

COMMENT ON COLUMN email_matter_filings.body_document_id IS
  'Document pipeline object containing searchable email subject, participant domains, and decoded body for this matter filing. Raw email body is not stored in email_messages.';

COMMENT ON COLUMN tenants.settings_json IS
  'Tenant settings object. D8 email body search defaults on unless emailBodySearchEnabled is explicitly false.';

-- Down Migration

DROP INDEX IF EXISTS uq_email_matter_filings_body_document;

ALTER TABLE email_matter_filings
  DROP CONSTRAINT IF EXISTS fk_email_matter_filings_body_document,
  DROP COLUMN IF EXISTS body_document_id;

UPDATE documents
SET document_type = 'correspondence'
WHERE document_type = 'email';

ALTER TABLE canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_extraction_method_check;

ALTER TABLE canonical_documents
  ADD CONSTRAINT canonical_documents_extraction_method_check CHECK (
    extraction_method IN ('pending', 'pdf_text', 'docx', 'hwpx', 'ocr', 'ocr_required', 'failed')
  );

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'contract',
      'memo',
      'opinion',
      'court_filing',
      'evidence',
      'correspondence',
      'corporate_record',
      'financial',
      'other'
    )
  );
