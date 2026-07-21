-- Up Migration

-- Matter creation must retain its safe distinction between an invalid client
-- reference (validation failure) and a client belonging to another tenant
-- (safe not-found). This returns only a boolean; no tenant or client data.
CREATE OR REPLACE FUNCTION app_client_exists_any_tenant(input_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM clients
    WHERE client_id = input_client_id
  )
$$;

REVOKE ALL ON FUNCTION app_client_exists_any_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_client_exists_any_tenant(uuid) TO vault_app;

COMMENT ON FUNCTION app_client_exists_any_tenant(uuid) IS
  'Runtime matter-input classifier. Returns only existence for an opaque client UUID; never tenant or client data.';

-- Down Migration

DROP FUNCTION IF EXISTS app_client_exists_any_tenant(uuid);
