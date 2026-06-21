-- Up Migration

ALTER TABLE work_items
  DROP CONSTRAINT IF EXISTS fk_work_items_target_disposal,
  DROP CONSTRAINT IF EXISTS work_items_source_check,
  DROP CONSTRAINT IF EXISTS work_items_kind_check,
  DROP CONSTRAINT IF EXISTS work_items_target_type_check;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_source_check CHECK (
    source IN ('records', 'operational_data')
  ),
  ADD CONSTRAINT work_items_kind_check CHECK (
    kind IN (
      'records_disposal_approval',
      'records_disposal_execution',
      'document_extraction_failed',
      'document_ocr_pending',
      'document_metadata_required',
      'duplicate_decision_pending',
      'upload_exception'
    )
  ),
  ADD CONSTRAINT work_items_target_type_check CHECK (
    target_type IN ('disposal_request', 'document', 'document_version', 'upload_preflight')
  );

CREATE INDEX idx_work_items_tenant_target
  ON work_items (tenant_id, target_type, target_id, source, kind);

COMMENT ON COLUMN work_items.target_id IS
  'Reference-only target UUID interpreted by target_type. Disposal requests and documents are joined before display; no polymorphic FK is used.';
COMMENT ON COLUMN work_items.kind IS
  'DMS work kind. Duplicate/upload-exception kinds require persisted source rows before display and must not be synthesized as fake tasks.';

-- Down Migration

DELETE FROM work_items
WHERE source <> 'records'
   OR target_type <> 'disposal_request'
   OR kind NOT IN ('records_disposal_approval', 'records_disposal_execution');

DROP INDEX IF EXISTS idx_work_items_tenant_target;

ALTER TABLE work_items
  DROP CONSTRAINT IF EXISTS work_items_source_check,
  DROP CONSTRAINT IF EXISTS work_items_kind_check,
  DROP CONSTRAINT IF EXISTS work_items_target_type_check;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_source_check CHECK (
    source IN ('records')
  ),
  ADD CONSTRAINT work_items_kind_check CHECK (
    kind IN ('records_disposal_approval', 'records_disposal_execution')
  ),
  ADD CONSTRAINT work_items_target_type_check CHECK (
    target_type IN ('disposal_request')
  ),
  ADD CONSTRAINT fk_work_items_target_disposal
    FOREIGN KEY (tenant_id, target_id)
    REFERENCES disposal_requests (tenant_id, disposal_request_id)
    ON DELETE RESTRICT;
