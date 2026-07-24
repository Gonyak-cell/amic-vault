-- Up Migration

-- RLS-EXEMPT: pre-authentication rate state must bound an unknown tenant or user
-- before a tenant context can be established. It stores only HMAC references and
-- is inaccessible to vault_app except through the narrow helpers below.
CREATE TABLE auth_throttle_states (
  throttle_scope text NOT NULL CHECK (
    throttle_scope IN (
      'login_account',
      'login_network',
      'reset_account',
      'reset_network',
      'mfa_challenge',
      'mfa_network'
    )
  ),
  reference_hash text NOT NULL CHECK (reference_hash ~ '^hmac-sha256:[0-9a-f]{64}$'),
  failure_count smallint NOT NULL CHECK (failure_count >= 0 AND failure_count <= 5),
  window_started_at timestamptz NOT NULL,
  next_allowed_at timestamptz NOT NULL,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (throttle_scope, reference_hash),
  CHECK (locked_until IS NULL OR locked_until >= window_started_at)
);

REVOKE ALL ON TABLE auth_throttle_states FROM PUBLIC;
REVOKE ALL ON TABLE auth_throttle_states FROM vault_app;

COMMENT ON TABLE auth_throttle_states IS
  'Global pre-authentication brute-force state. It contains only fixed scopes, HMAC-SHA-256 references, bounded counters, and database timestamps; raw account, email, IP, tenant, user, token, code, user-agent, document, or request-body values are forbidden.';

CREATE OR REPLACE FUNCTION app_auth_throttle_check(
  input_scope text,
  input_reference_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state auth_throttle_states%ROWTYPE;
  throttle_now timestamptz := clock_timestamp();
BEGIN
  IF input_scope IS NULL
    OR input_reference_hash IS NULL
    OR input_scope NOT IN (
      'login_account',
      'login_network',
      'reset_account',
      'reset_network',
      'mfa_challenge',
      'mfa_network'
    )
    OR input_reference_hash !~ '^hmac-sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_scope || ':' || input_reference_hash, 0)
  );

  SELECT *
  INTO state
  FROM auth_throttle_states
  WHERE throttle_scope = input_scope
    AND reference_hash = input_reference_hash;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN (state.locked_until IS NULL OR state.locked_until <= throttle_now)
    AND state.next_allowed_at <= throttle_now;
END;
$$;

CREATE OR REPLACE FUNCTION app_auth_throttle_record_failure(
  input_scope text,
  input_reference_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state auth_throttle_states%ROWTYPE;
  throttle_now timestamptz := clock_timestamp();
  next_count smallint;
  backoff interval;
BEGIN
  IF input_scope IS NULL
    OR input_reference_hash IS NULL
    OR input_scope NOT IN (
      'login_account',
      'login_network',
      'reset_account',
      'reset_network',
      'mfa_challenge',
      'mfa_network'
    )
    OR input_reference_hash !~ '^hmac-sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_scope || ':' || input_reference_hash, 0)
  );

  SELECT *
  INTO state
  FROM auth_throttle_states
  WHERE throttle_scope = input_scope
    AND reference_hash = input_reference_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO auth_throttle_states (
      throttle_scope,
      reference_hash,
      failure_count,
      window_started_at,
      next_allowed_at,
      locked_until,
      updated_at
    ) VALUES (
      input_scope,
      input_reference_hash,
      1,
      throttle_now,
      throttle_now + interval '1 second',
      NULL,
      throttle_now
    );
    RETURN true;
  END IF;

  IF state.locked_until IS NOT NULL AND state.locked_until > throttle_now THEN
    RETURN false;
  END IF;

  IF state.window_started_at <= throttle_now - interval '15 minutes'
    OR (state.locked_until IS NOT NULL AND state.locked_until <= throttle_now) THEN
    UPDATE auth_throttle_states
    SET failure_count = 1,
        window_started_at = throttle_now,
        next_allowed_at = throttle_now + interval '1 second',
        locked_until = NULL,
        updated_at = throttle_now
    WHERE throttle_scope = input_scope
      AND reference_hash = input_reference_hash;
    RETURN true;
  END IF;

  next_count := least(state.failure_count + 1, 5);
  backoff := CASE next_count
    WHEN 1 THEN interval '1 second'
    WHEN 2 THEN interval '2 seconds'
    WHEN 3 THEN interval '4 seconds'
    WHEN 4 THEN interval '8 seconds'
    ELSE interval '15 minutes'
  END;

  UPDATE auth_throttle_states
  SET failure_count = next_count,
      next_allowed_at = throttle_now + backoff,
      locked_until = CASE
        WHEN next_count >= 5 THEN throttle_now + interval '15 minutes'
        ELSE NULL
      END,
      updated_at = throttle_now
  WHERE throttle_scope = input_scope
    AND reference_hash = input_reference_hash;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app_auth_throttle_consume(
  input_scope text,
  input_reference_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state auth_throttle_states%ROWTYPE;
  throttle_now timestamptz := clock_timestamp();
BEGIN
  IF input_scope IS NULL
    OR input_reference_hash IS NULL
    OR input_scope NOT IN (
      'login_account',
      'login_network',
      'reset_account',
      'reset_network',
      'mfa_challenge',
      'mfa_network'
    )
    OR input_reference_hash !~ '^hmac-sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_scope || ':' || input_reference_hash, 0)
  );

  SELECT *
  INTO state
  FROM auth_throttle_states
  WHERE throttle_scope = input_scope
    AND reference_hash = input_reference_hash
  FOR UPDATE;

  IF FOUND AND (
    (state.locked_until IS NOT NULL AND state.locked_until > throttle_now)
    OR state.next_allowed_at > throttle_now
  ) THEN
    RETURN false;
  END IF;

  RETURN app_auth_throttle_record_failure(input_scope, input_reference_hash);
END;
$$;

CREATE OR REPLACE FUNCTION app_auth_throttle_clear(
  input_scope text,
  input_reference_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF input_scope IS NULL
    OR input_reference_hash IS NULL
    OR input_scope NOT IN (
      'login_account',
      'login_network',
      'reset_account',
      'reset_network',
      'mfa_challenge',
      'mfa_network'
    )
    OR input_reference_hash !~ '^hmac-sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_THROTTLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_scope || ':' || input_reference_hash, 0)
  );

  DELETE FROM auth_throttle_states
  WHERE throttle_scope = input_scope
    AND reference_hash = input_reference_hash;
END;
$$;

REVOKE ALL ON FUNCTION app_auth_throttle_check(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_throttle_record_failure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_throttle_consume(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_throttle_clear(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_auth_throttle_check(text, text) TO vault_app;
GRANT EXECUTE ON FUNCTION app_auth_throttle_record_failure(text, text) TO vault_app;
GRANT EXECUTE ON FUNCTION app_auth_throttle_consume(text, text) TO vault_app;
GRANT EXECUTE ON FUNCTION app_auth_throttle_clear(text, text) TO vault_app;

COMMENT ON FUNCTION app_auth_throttle_check(text, text) IS
  'Exact HMAC reference check only. Returns whether the database-clock backoff and lockout permit a pre-authentication attempt.';
COMMENT ON FUNCTION app_auth_throttle_record_failure(text, text) IS
  'Exact HMAC reference mutation only. Applies 1/2/4/8-second backoff and a 15-minute lock after five attempts using the database clock.';
COMMENT ON FUNCTION app_auth_throttle_consume(text, text) IS
  'Exact HMAC reference consumption only. Password-reset request consumption is intentionally counted before its outwardly identical accepted response.';
COMMENT ON FUNCTION app_auth_throttle_clear(text, text) IS
  'Exact HMAC reference clear only after successful password or MFA proof.';

-- Down Migration

DROP FUNCTION IF EXISTS app_auth_throttle_clear(text, text);
DROP FUNCTION IF EXISTS app_auth_throttle_consume(text, text);
DROP FUNCTION IF EXISTS app_auth_throttle_record_failure(text, text);
DROP FUNCTION IF EXISTS app_auth_throttle_check(text, text);
DROP TABLE IF EXISTS auth_throttle_states;
