-- Up Migration
-- Terminal disposal retries are never automatic: one audited, tenant-scoped
-- authorization is required for each terminal state being returned to pending.

CREATE TABLE records_disposal_retry_authorizations (
  retry_authorization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  disposal_outbox_id uuid NOT NULL,
  terminal_state text NOT NULL CHECK (terminal_state IN ('dead_letter', 'blocked')),
  terminal_error_code text NOT NULL CHECK (terminal_error_code ~ '^[a-z_]{2,64}$'),
  retry_reason_code text NOT NULL CHECK (retry_reason_code ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  authorized_by uuid NOT NULL,
  audit_event_id uuid NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, retry_authorization_id),
  UNIQUE (tenant_id, disposal_outbox_id, audit_event_id),
  CONSTRAINT fk_records_disposal_retry_outbox FOREIGN KEY (tenant_id, disposal_outbox_id)
    REFERENCES records_disposal_outbox(tenant_id, disposal_outbox_id) ON DELETE RESTRICT,
  CONSTRAINT fk_records_disposal_retry_authorized_by FOREIGN KEY (tenant_id, authorized_by)
    REFERENCES users(tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE records_disposal_retry_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE records_disposal_retry_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_records_disposal_retry_authorizations_tenant ON records_disposal_retry_authorizations
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON records_disposal_retry_authorizations TO vault_app;

CREATE OR REPLACE FUNCTION app_block_records_disposal_retry_authorization_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'records disposal retry authorization is append-only';
END;
$$;
CREATE TRIGGER records_disposal_retry_authorizations_append_only
  BEFORE UPDATE OR DELETE ON records_disposal_retry_authorizations
  FOR EACH ROW EXECUTE FUNCTION app_block_records_disposal_retry_authorization_mutation();

CREATE OR REPLACE FUNCTION app_validate_records_disposal_outbox_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.disposal_outbox_id IS DISTINCT FROM OLD.disposal_outbox_id
    OR NEW.disposal_request_id IS DISTINCT FROM OLD.disposal_request_id OR NEW.inventory_hash IS DISTINCT FROM OLD.inventory_hash
    OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'records disposal outbox sealed authority fields are immutable';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'pending' AND NEW.state = 'processing')
    OR (OLD.state = 'processing' AND NEW.state IN ('pending', 'completed', 'dead_letter', 'blocked'))
    OR (OLD.state IN ('dead_letter', 'blocked') AND NEW.state = 'pending'
      AND EXISTS (SELECT 1 FROM records_disposal_retry_authorizations retry_authorization
        WHERE retry_authorization.tenant_id = OLD.tenant_id
          AND retry_authorization.disposal_outbox_id = OLD.disposal_outbox_id
          AND retry_authorization.terminal_state = OLD.state
          AND retry_authorization.terminal_error_code = OLD.last_error_code
          AND retry_authorization.authorized_at >= OLD.terminal_at))
  ) THEN RAISE EXCEPTION 'invalid records disposal outbox transition: % -> %', OLD.state, NEW.state; END IF;
  IF OLD.state = 'pending' AND NEW.state = 'processing' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1 THEN RAISE EXCEPTION 'records disposal outbox claim must increment attempt count'; END IF;
  ELSIF NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN RAISE EXCEPTION 'records disposal outbox attempt count is immutable outside claim'; END IF;
  RETURN NEW;
END;
$$;

DO $$ DECLARE action_values text[]; action_list text; BEGIN
  SELECT array_agg(action_name ORDER BY action_name) INTO action_values FROM (
    SELECT DISTINCT match[1] AS action_name FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match WHERE c.conrelid = 'audit_events'::regclass AND c.conname = 'audit_events_action_check'
    UNION SELECT 'DISPOSAL_RETRY_AUTHORIZED'
  ) actions;
  SELECT string_agg(quote_literal(action_name), ', ') INTO action_list FROM unnest(action_values) AS values(action_name);
  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

-- Down Migration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM records_disposal_retry_authorizations LIMIT 1)
    OR EXISTS (SELECT 1 FROM audit_events WHERE action = 'DISPOSAL_RETRY_AUTHORIZED' LIMIT 1) THEN
    RAISE EXCEPTION 'cannot rollback 0203 while disposal retry evidence exists';
  END IF;
END $$;
DROP TABLE records_disposal_retry_authorizations;
DROP FUNCTION app_block_records_disposal_retry_authorization_mutation();
CREATE OR REPLACE FUNCTION app_validate_records_disposal_outbox_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.disposal_outbox_id IS DISTINCT FROM OLD.disposal_outbox_id
    OR NEW.disposal_request_id IS DISTINCT FROM OLD.disposal_request_id OR NEW.inventory_hash IS DISTINCT FROM OLD.inventory_hash
    OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'records disposal outbox sealed authority fields are immutable';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'pending' AND NEW.state = 'processing')
    OR (OLD.state = 'processing' AND NEW.state IN ('pending', 'completed', 'dead_letter', 'blocked'))
  ) THEN RAISE EXCEPTION 'invalid records disposal outbox transition: % -> %', OLD.state, NEW.state; END IF;
  IF OLD.state = 'pending' AND NEW.state = 'processing' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1 THEN RAISE EXCEPTION 'records disposal outbox claim must increment attempt count'; END IF;
  ELSIF NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN RAISE EXCEPTION 'records disposal outbox attempt count is immutable outside claim'; END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE action_values text[]; action_list text; BEGIN
  SELECT array_agg(action_name ORDER BY action_name) INTO action_values FROM (
    SELECT DISTINCT match[1] AS action_name FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match WHERE c.conrelid = 'audit_events'::regclass AND c.conname = 'audit_events_action_check' AND match[1] <> 'DISPOSAL_RETRY_AUTHORIZED'
  ) actions;
  SELECT string_agg(quote_literal(action_name), ', ') INTO action_list FROM unnest(action_values) AS values(action_name);
  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
