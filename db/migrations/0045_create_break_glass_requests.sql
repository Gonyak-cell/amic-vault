-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
CREATE TABLE break_glass_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  wall_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'client_emergency',
      'court_deadline',
      'privileged_access_review',
      'security_review'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'revoked', 'expired')
  ),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id),
  CONSTRAINT fk_break_glass_requests_wall
    FOREIGN KEY (tenant_id, wall_id)
    REFERENCES ethical_walls (tenant_id, wall_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_break_glass_requests_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_break_glass_requests_requester
    FOREIGN KEY (tenant_id, requester_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_break_glass_requests_revoked_by
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT break_glass_requests_future_expiry CHECK (expires_at > created_at),
  CONSTRAINT break_glass_requests_revoked_pair CHECK (
    (revoked_by IS NULL AND revoked_at IS NULL)
    OR (revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT break_glass_requests_status_consistency CHECK (
    (
      status = 'pending'
      AND approved_at IS NULL
      AND revoked_by IS NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'approved'
      AND approved_at IS NOT NULL
      AND revoked_by IS NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'revoked'
      AND revoked_by IS NOT NULL
      AND revoked_at IS NOT NULL
    )
    OR (
      status = 'expired'
      AND revoked_by IS NULL
      AND revoked_at IS NULL
    )
  )
);

CREATE INDEX idx_break_glass_requests_active
  ON break_glass_requests (tenant_id, wall_id, requester_id, expires_at DESC)
  WHERE status = 'approved' AND revoked_at IS NULL;

CREATE INDEX idx_break_glass_requests_matter_status
  ON break_glass_requests (tenant_id, matter_id, status, created_at DESC);

ALTER TABLE break_glass_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_glass_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_break_glass_requests_tenant ON break_glass_requests
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON break_glass_requests TO vault_app;

CREATE TABLE break_glass_approvals (
  approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  approver_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, approval_id),
  UNIQUE (tenant_id, request_id, approver_id),
  CONSTRAINT fk_break_glass_approvals_request
    FOREIGN KEY (tenant_id, request_id)
    REFERENCES break_glass_requests (tenant_id, request_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_break_glass_approvals_approver
    FOREIGN KEY (tenant_id, approver_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_break_glass_approvals_request
  ON break_glass_approvals (tenant_id, request_id, approved_at);

ALTER TABLE break_glass_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_glass_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_break_glass_approvals_tenant ON break_glass_approvals
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON break_glass_approvals TO vault_app;

CREATE OR REPLACE FUNCTION enforce_break_glass_approval_constraints()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_requester uuid;
  request_status text;
  request_expires_at timestamptz;
BEGIN
  SELECT requester_id, status, expires_at
    INTO request_requester, request_status, request_expires_at
  FROM break_glass_requests
  WHERE tenant_id = NEW.tenant_id
    AND request_id = NEW.request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'break glass request not found';
  END IF;

  IF request_requester = NEW.approver_id THEN
    RAISE EXCEPTION 'break glass requester cannot approve own request';
  END IF;

  IF request_status <> 'pending' THEN
    RAISE EXCEPTION 'break glass request is not pending';
  END IF;

  IF request_expires_at <= now() THEN
    RAISE EXCEPTION 'break glass request is expired';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_break_glass_approval_constraints
  BEFORE INSERT ON break_glass_approvals
  FOR EACH ROW
  EXECUTE FUNCTION enforce_break_glass_approval_constraints();

COMMENT ON TABLE break_glass_requests IS
  'R5 break-glass dual approval requests. Store reason codes and references only; no document body, sensitive snippets, or free-text secrets.';

COMMENT ON TABLE break_glass_approvals IS
  'R5 break-glass approvals. Two distinct non-requester approvers are required before a request can become an active wall override.';

-- Down Migration

DROP TRIGGER IF EXISTS trg_break_glass_approval_constraints ON break_glass_approvals;
DROP FUNCTION IF EXISTS enforce_break_glass_approval_constraints();
DROP TABLE IF EXISTS break_glass_approvals;
DROP TABLE IF EXISTS break_glass_requests;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After break-glass audit rows have been recorded,
-- rollback cannot safely remove BREAK_GLASS_* actions from the allow-list.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
      'BREAK_GLASS_EXPIRED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
