-- Up Migration

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'dd_data_room_mappings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%mapping_status%'
  LOOP
    EXECUTE format('ALTER TABLE dd_data_room_mappings DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE dd_data_room_mappings
  ADD CONSTRAINT dd_data_room_mappings_mapping_status_check CHECK (
    mapping_status IN ('mapped', 'missing', 'supplement_requested', 'suggested')
  ),
  ADD CONSTRAINT dd_data_room_mappings_document_status_check CHECK (
    (mapping_status IN ('mapped', 'suggested') AND document_id IS NOT NULL)
    OR (mapping_status NOT IN ('mapped', 'suggested') AND document_id IS NULL)
  );

CREATE UNIQUE INDEX idx_dd_data_room_mapping_suggestion_unique
  ON dd_data_room_mappings (tenant_id, matter_id, rfi_id, document_id, version_id)
  WHERE mapping_status = 'suggested';

GRANT DELETE ON dd_data_room_mappings TO vault_app;

COMMENT ON COLUMN dd_data_room_mappings.mapping_status IS
  'Internal DD mapping state. suggested rows are deterministic upload-classification candidates and must be approved before traceability treats them as confirmed evidence.';

-- Down Migration

DELETE FROM work_items wi
USING dd_data_room_mappings drm
WHERE wi.tenant_id = drm.tenant_id
  AND wi.source = 'operational_data'
  AND wi.kind = 'dd_mapping_review'
  AND wi.target_type = 'dd_mapping'
  AND wi.target_id = drm.mapping_id
  AND drm.mapping_status = 'suggested';

DELETE FROM dd_data_room_mappings
WHERE mapping_status = 'suggested';

DROP INDEX IF EXISTS idx_dd_data_room_mapping_suggestion_unique;

ALTER TABLE dd_data_room_mappings
  DROP CONSTRAINT IF EXISTS dd_data_room_mappings_mapping_status_check,
  DROP CONSTRAINT IF EXISTS dd_data_room_mappings_document_status_check;

ALTER TABLE dd_data_room_mappings
  ADD CONSTRAINT dd_data_room_mappings_mapping_status_check CHECK (
    mapping_status IN ('mapped', 'missing', 'supplement_requested')
  ),
  ADD CONSTRAINT dd_data_room_mappings_document_status_check CHECK (
    (mapping_status = 'mapped' AND document_id IS NOT NULL)
    OR (mapping_status <> 'mapped' AND document_id IS NULL)
  );

REVOKE DELETE ON dd_data_room_mappings FROM vault_app;
