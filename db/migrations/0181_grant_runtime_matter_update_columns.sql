-- Up Migration

-- Audited matter lifecycle and metadata updates execute through the runtime
-- tenant transaction. Preserve RLS and grant only the columns written by the
-- existing MatterService mutation paths.
GRANT UPDATE (
  status, opened_at, closed_at,
  matter_name, practice_group, metadata_json, access_scope,
  confidentiality_level, lead_partner_id, lead_lawyer_id, lead_associate_id,
  updated_at
) ON matters TO vault_app;

-- Down Migration

REVOKE UPDATE (
  status, opened_at, closed_at,
  matter_name, practice_group, metadata_json, access_scope,
  confidentiality_level, lead_partner_id, lead_lawyer_id, lead_associate_id,
  updated_at
) ON matters FROM vault_app;
