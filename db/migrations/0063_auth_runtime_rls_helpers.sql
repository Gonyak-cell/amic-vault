-- Up Migration

CREATE OR REPLACE FUNCTION app_find_active_session_by_token_hash(input_token_hash text)
RETURNS TABLE (
  session_id uuid,
  tenant_id uuid,
  user_id uuid,
  token_hash text,
  mfa_verified boolean,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.session_id,
    s.tenant_id,
    s.user_id,
    s.token_hash,
    s.mfa_verified,
    s.expires_at,
    s.revoked_at
  FROM sessions s
  WHERE input_token_hash ~ '^sha256:[0-9a-f]{64}$'
    AND s.token_hash = input_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_find_active_session_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_active_session_by_token_hash(text) TO vault_app;

COMMENT ON FUNCTION app_find_active_session_by_token_hash(text) IS
  'Runtime auth helper. Exact opaque session-token hash lookup only; no tenant row scan interface.';

CREATE OR REPLACE FUNCTION app_revoke_session_by_token_hash(input_token_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sessions
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE input_token_hash ~ '^sha256:[0-9a-f]{64}$'
    AND token_hash = input_token_hash
$$;

REVOKE ALL ON FUNCTION app_revoke_session_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_revoke_session_by_token_hash(text) TO vault_app;

COMMENT ON FUNCTION app_revoke_session_by_token_hash(text) IS
  'Runtime auth helper. Exact opaque session-token hash revoke only.';

CREATE OR REPLACE FUNCTION app_consume_password_reset_token_hash(input_token_hash text)
RETURNS TABLE (
  tenant_id uuid,
  user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE password_reset_tokens
  SET used_at = now()
  WHERE input_token_hash ~ '^sha256:[0-9a-f]{64}$'
    AND token_hash = input_token_hash
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING password_reset_tokens.tenant_id, password_reset_tokens.user_id
$$;

REVOKE ALL ON FUNCTION app_consume_password_reset_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_consume_password_reset_token_hash(text) TO vault_app;

COMMENT ON FUNCTION app_consume_password_reset_token_hash(text) IS
  'Runtime auth helper. Exact password-reset token hash consume only; raw token is never stored.';

-- Down Migration

DROP FUNCTION IF EXISTS app_consume_password_reset_token_hash(text);
DROP FUNCTION IF EXISTS app_revoke_session_by_token_hash(text);
DROP FUNCTION IF EXISTS app_find_active_session_by_token_hash(text);
