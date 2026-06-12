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
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

ALTER TABLE ai_sessions
  ADD CONSTRAINT ai_sessions_tenant_session_matter_unique
  UNIQUE (tenant_id, ai_session_id, matter_id);

CREATE TABLE feedback_items (
  feedback_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  ai_session_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  helpful boolean,
  correction_type text NOT NULL DEFAULT 'none' CHECK (
    correction_type IN (
      'none',
      'minor_edit',
      'major_edit',
      'unsupported_claim_removed',
      'citation_fixed'
    )
  ),
  error_types text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(error_types) <= 8
    AND error_types <@ ARRAY[
      'incorrect_citation',
      'missing_source',
      'hallucination',
      'permission_concern',
      'not_useful',
      'other'
    ]::text[]
  ),
  edit_distance integer NOT NULL DEFAULT 0 CHECK (edit_distance BETWEEN 0 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feedback_item_id),
  CONSTRAINT fk_feedback_items_session
    FOREIGN KEY (tenant_id, ai_session_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_feedback_items_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_feedback_items_actor
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT feedback_session_matter_consistency
    FOREIGN KEY (tenant_id, ai_session_id, matter_id)
    REFERENCES ai_sessions (tenant_id, ai_session_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT feedback_none_edit_distance_check CHECK (
    correction_type <> 'none' OR edit_distance = 0
  )
);

CREATE INDEX idx_feedback_items_tenant_session_created
  ON feedback_items (tenant_id, ai_session_id, created_at DESC);

CREATE INDEX idx_feedback_items_tenant_matter_created
  ON feedback_items (tenant_id, matter_id, created_at DESC);

ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_feedback_items_tenant ON feedback_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON feedback_items TO vault_app;

COMMENT ON TABLE feedback_items IS
  'R6 AI feedback store. Stores structured ratings, correction codes, error codes, and edit distance only; prompt, response, source text, snippets, and free-form comments are intentionally absent.';

-- Down Migration

DROP TABLE IF EXISTS feedback_items;

ALTER TABLE ai_sessions
  DROP CONSTRAINT IF EXISTS ai_sessions_tenant_session_matter_unique;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After feedback audit rows have been recorded,
-- rollback cannot safely remove AI_FEEDBACK_RECORDED from the allow-list.
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
      'AUDIT_QUERY_EXECUTED',
      'AUDIT_EXPORT_CREATED',
      'AI_POLICY_EVALUATED',
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_FEEDBACK_RECORDED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
