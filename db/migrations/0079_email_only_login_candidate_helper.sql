-- Up Migration

CREATE OR REPLACE FUNCTION app_find_unique_login_candidate_by_email(input_email text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_region text,
  tenant_data_residency text,
  tenant_status text,
  tenant_created_at timestamptz,
  tenant_updated_at timestamptz,
  user_id uuid,
  user_email text,
  user_name text,
  user_role text,
  user_practice_group text,
  user_status text,
  user_password_hash text,
  user_mfa_enabled boolean,
  user_last_login_at timestamptz,
  user_created_at timestamptz,
  user_updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      t.tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      t.region AS tenant_region,
      t.data_residency AS tenant_data_residency,
      t.status::text AS tenant_status,
      t.created_at AS tenant_created_at,
      t.updated_at AS tenant_updated_at,
      u.user_id,
      u.email AS user_email,
      u.name AS user_name,
      u.role::text AS user_role,
      u.practice_group AS user_practice_group,
      u.status::text AS user_status,
      u.password_hash AS user_password_hash,
      u.mfa_enabled AS user_mfa_enabled,
      u.last_login_at AS user_last_login_at,
      u.created_at AS user_created_at,
      u.updated_at AS user_updated_at,
      count(*) OVER () AS candidate_count
    FROM tenants t
    JOIN users u ON u.tenant_id = t.tenant_id
    WHERE t.status = 'active'
      AND lower(u.email) = lower(input_email)
  )
  SELECT
    candidates.tenant_id,
    candidates.tenant_name,
    candidates.tenant_slug,
    candidates.tenant_region,
    candidates.tenant_data_residency,
    candidates.tenant_status,
    candidates.tenant_created_at,
    candidates.tenant_updated_at,
    candidates.user_id,
    candidates.user_email,
    candidates.user_name,
    candidates.user_role,
    candidates.user_practice_group,
    candidates.user_status,
    candidates.user_password_hash,
    candidates.user_mfa_enabled,
    candidates.user_last_login_at,
    candidates.user_created_at,
    candidates.user_updated_at
  FROM candidates
  WHERE candidates.candidate_count = 1
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_find_unique_login_candidate_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_unique_login_candidate_by_email(text) TO vault_app;

COMMENT ON FUNCTION app_find_unique_login_candidate_by_email(text) IS
  'Runtime auth helper. Email-only login resolves only when exactly one user exists in active tenants; duplicate emails fail closed.';

-- Down Migration

DROP FUNCTION IF EXISTS app_find_unique_login_candidate_by_email(text);
