-- Up Migration

CREATE TABLE amic_os_vault_ocr_pages (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  version_id uuid NOT NULL,
  document_id uuid NOT NULL,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  page_number integer NOT NULL CHECK (page_number BETWEEN 1 AND 200),
  page_text text NOT NULL CHECK (char_length(page_text) <= 1000000),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_revision integer NOT NULL DEFAULT 1 CHECK (source_revision >= 1),
  source_result_sha256 char(64) NOT NULL CHECK (source_result_sha256 ~ '^[0-9a-f]{64}$'),
  corrected_text text CHECK (corrected_text IS NULL OR char_length(corrected_text) <= 1000000),
  correction_revision integer NOT NULL DEFAULT 0 CHECK (correction_revision >= 0),
  corrected_by uuid,
  corrected_at timestamptz,
  PRIMARY KEY (tenant_id, version_id, page_number),
  CONSTRAINT fk_amic_os_vault_ocr_pages_version FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions(tenant_id, version_id) ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_vault_ocr_pages_document FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents(tenant_id, document_id) ON DELETE RESTRICT,
  CONSTRAINT fk_amic_os_vault_ocr_pages_corrector FOREIGN KEY (tenant_id, corrected_by)
    REFERENCES users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT amic_os_vault_ocr_pages_correction_binding CHECK (
    (correction_revision = 0 AND corrected_text IS NULL AND corrected_by IS NULL AND corrected_at IS NULL)
    OR (correction_revision > 0 AND corrected_text IS NOT NULL AND corrected_by IS NOT NULL AND corrected_at IS NOT NULL)
  )
);

CREATE INDEX idx_amic_os_vault_ocr_pages_document
  ON amic_os_vault_ocr_pages(tenant_id, document_id, version_id, page_number);

CREATE FUNCTION preserve_amic_os_vault_ocr_corrections() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.correction_revision > 0 THEN
    RAISE EXCEPTION 'OCR_CORRECTIONS_MUST_BE_PRESERVED';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER preserve_amic_os_vault_ocr_corrections_before_delete
  BEFORE DELETE ON amic_os_vault_ocr_pages
  FOR EACH ROW EXECUTE FUNCTION preserve_amic_os_vault_ocr_corrections();

ALTER TABLE amic_os_vault_ocr_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE amic_os_vault_ocr_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_amic_os_vault_ocr_pages_tenant ON amic_os_vault_ocr_pages
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON amic_os_vault_ocr_pages TO vault_app;
GRANT UPDATE (corrected_text, correction_revision, corrected_by, corrected_at)
  ON amic_os_vault_ocr_pages TO vault_app;

COMMENT ON TABLE amic_os_vault_ocr_pages IS
  'Verified page-local OCR for an immutable source version. Read only through current promoted source and document permission checks.';

-- Down Migration

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM amic_os_vault_ocr_pages LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot discard OCR page text or corrections';
  END IF;
END $$;
DROP TABLE amic_os_vault_ocr_pages;
DROP FUNCTION preserve_amic_os_vault_ocr_corrections();
