-- Up Migration

-- A capability token cannot provide tenant context before lookup. This bounded
-- function is the only exception: it returns the existing link state needed to
-- establish that context, never an arbitrary tenant/table query surface.
CREATE OR REPLACE FUNCTION app_find_external_link_by_token_hash(input_token_hash text)
RETURNS TABLE (
  link_id uuid,
  tenant_id uuid,
  workspace_id uuid,
  external_user_id uuid,
  document_id uuid,
  version_id uuid,
  status text,
  expires_at timestamptz,
  nda_required boolean,
  watermark_required boolean,
  dlp_warning_status text,
  dlp_result_hash text,
  dlp_finding_count integer,
  dlp_override_reason_code text,
  created_at timestamptz,
  updated_at timestamptz,
  matter_id uuid,
  workspace_status text,
  external_user_status text,
  membership_status text,
  document_status text,
  document_legal_hold boolean,
  matter_legal_hold boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.link_id, l.tenant_id, l.workspace_id, l.external_user_id,
    l.document_id, l.version_id, l.status, l.expires_at, l.nda_required,
    l.watermark_required, l.dlp_warning_status, l.dlp_result_hash,
    l.dlp_finding_count, l.dlp_override_reason_code, l.created_at, l.updated_at,
    w.matter_id, w.status AS workspace_status, u.status AS external_user_status,
    m.status AS membership_status, d.status AS document_status,
    d.legal_hold AS document_legal_hold, mt.legal_hold AS matter_legal_hold
  FROM external_secure_links l
  JOIN external_workspaces w
    ON w.tenant_id = l.tenant_id
   AND w.workspace_id = l.workspace_id
  JOIN external_workspace_members m
    ON m.tenant_id = l.tenant_id
   AND m.workspace_id = l.workspace_id
   AND m.external_user_id = l.external_user_id
  JOIN external_users u
    ON u.tenant_id = l.tenant_id
   AND u.external_user_id = l.external_user_id
  JOIN documents d
    ON d.tenant_id = l.tenant_id
   AND d.document_id = l.document_id
  JOIN matters mt
    ON mt.tenant_id = d.tenant_id
   AND mt.matter_id = d.matter_id
  WHERE l.token_hash = input_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_find_external_link_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_external_link_by_token_hash(text) TO vault_app;

COMMENT ON FUNCTION app_find_external_link_by_token_hash(text) IS
  'Runtime capability-token resolver. Returns only the existing external-link state required to establish tenant context.';

-- Down Migration

DROP FUNCTION IF EXISTS app_find_external_link_by_token_hash(text);
