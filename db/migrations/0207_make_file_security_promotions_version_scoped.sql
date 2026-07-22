-- Up Migration

ALTER TABLE file_security_promotions
  DROP CONSTRAINT file_security_promotions_tenant_id_document_id_key;

-- Down Migration

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM file_security_promotions
    GROUP BY tenant_id, document_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot restore document-scoped promotion uniqueness while multiple promoted versions exist';
  END IF;
END $$;

ALTER TABLE file_security_promotions
  ADD CONSTRAINT file_security_promotions_tenant_id_document_id_key
  UNIQUE (tenant_id, document_id);
