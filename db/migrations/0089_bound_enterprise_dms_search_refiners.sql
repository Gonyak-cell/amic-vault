-- Up Migration

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

COMMENT ON CONSTRAINT enterprise_dms_search_refiners_field_key_supported
  ON enterprise_dms_search_refiners IS
  'Bounds tenant-governed search refiners to filter fields implemented by the permission-scoped search UI/query contract.';

-- Down Migration

ALTER TABLE enterprise_dms_search_refiners
  DROP CONSTRAINT IF EXISTS enterprise_dms_search_refiners_field_key_supported;
