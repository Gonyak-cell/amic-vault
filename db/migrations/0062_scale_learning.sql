-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R14 scale audit rows have been recorded,
-- rollback cannot safely remove the R14 scale actions from the allow-list.
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
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'CONTRACT_CLASSIFIED',
      'CONTRACT_CLAUSES_EXTRACTED',
      'CONTRACT_TERMS_EXTRACTED',
      'CONTRACT_REDLINE_PARSED',
      'PLAYBOOK_RULE_CHANGED',
      'CONTRACT_RULE_EVALUATED',
      'CONTRACT_CLAUSE_BANK_VIEWED',
      'DD_RFI_CHANGED',
      'DD_DATA_ROOM_MAPPED',
      'DD_ISSUE_CHANGED',
      'DD_RISK_CHANGED',
      'DD_TRACE_VIEWED',
      'LIT_EVIDENCE_CHANGED',
      'LIT_FACT_CHANGED',
      'LIT_ISSUE_TREE_CHANGED',
      'LIT_PLEADING_CHANGED',
      'LIT_CASE_MAP_VIEWED',
      'EXTERNAL_USER_CHANGED',
      'EXTERNAL_WORKSPACE_CHANGED',
      'EXTERNAL_LINK_CREATED',
      'EXTERNAL_LINK_REVOKED',
      'EXTERNAL_LINK_ACCESSED',
      'EXTERNAL_NDA_ACCEPTED',
      'EXTERNAL_DLP_WARNING_BLOCKED',
      'EXTERNAL_DLP_WARNING_ACCEPTED',
      'EXTERNAL_DOWNLOAD_REQUESTED',
      'EXTERNAL_QA_MESSAGE_RECORDED',
      'RETENTION_POLICY_CHANGED',
      'LEGAL_HOLD_APPLIED',
      'LEGAL_HOLD_RELEASED',
      'RECORD_ARCHIVED',
      'DISPOSAL_REQUESTED',
      'DISPOSAL_APPROVED',
      'DISPOSAL_EXECUTED',
      'DISPOSAL_CERTIFICATE_CREATED',
      'SSO_PROVIDER_CHANGED',
      'SSO_METADATA_VIEWED',
      'BYOK_KEY_REFERENCE_CHANGED',
      'SIEM_EXPORT_RECORDED',
      'BACKUP_SNAPSHOT_RECORDED',
      'COMPLIANCE_EVIDENCE_RECORDED',
      'ENTERPRISE_READINESS_VIEWED',
      'SCALE_PERFORMANCE_RECORDED',
      'SCALE_COST_SNAPSHOT_RECORDED',
      'SCALE_EVAL_RUN_RECORDED',
      'SCALE_MIGRATION_DRILL_RECORDED',
      'SCALE_LEARNING_EVENT_RECORDED',
      'ADVANCED_AI_GATE_REVIEWED',
      'SCALE_READINESS_VIEWED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

CREATE TABLE scale_performance_runs (
  performance_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  scenario text NOT NULL CHECK (
    scenario IN ('api_readiness', 'search_query', 'ai_gate', 'db_integration', 'web_console')
  ),
  sample_count integer NOT NULL CHECK (sample_count BETWEEN 1 AND 100000),
  p50_ms integer NOT NULL CHECK (p50_ms >= 0),
  p95_ms integer NOT NULL CHECK (p95_ms >= p50_ms),
  p99_ms integer NOT NULL CHECK (p99_ms >= p95_ms),
  target_p95_ms integer NOT NULL CHECK (target_p95_ms > 0),
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  measurement_hash char(64) NOT NULL CHECK (measurement_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, performance_run_id),
  CONSTRAINT fk_scale_performance_runs_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_performance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_performance_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_performance_runs_tenant ON scale_performance_runs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_performance_runs TO vault_app;

CREATE TABLE scale_cost_snapshots (
  cost_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('compute', 'storage', 'database', 'ai', 'total')),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  unit_count bigint NOT NULL CHECK (unit_count >= 0),
  estimated_cost_cents bigint NOT NULL CHECK (estimated_cost_cents >= 0),
  currency text NOT NULL CHECK (currency IN ('KRW', 'USD')),
  cost_model_hash char(64) NOT NULL CHECK (cost_model_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cost_snapshot_id),
  CONSTRAINT fk_scale_cost_snapshots_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_cost_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_cost_snapshots_tenant ON scale_cost_snapshots
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_cost_snapshots TO vault_app;

CREATE TABLE scale_eval_runs (
  eval_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  suite text NOT NULL CHECK (
    suite IN ('search_korean', 'ai_gate', 'contract_gate', 'graph_consistency', 'full_regression')
  ),
  case_count integer NOT NULL CHECK (case_count >= 0),
  pass_count integer NOT NULL CHECK (pass_count >= 0),
  fail_count integer NOT NULL CHECK (fail_count >= 0),
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  metric_hash char(64) NOT NULL CHECK (metric_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, eval_run_id),
  CHECK (pass_count + fail_count = case_count),
  CONSTRAINT fk_scale_eval_runs_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_eval_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_eval_runs_tenant ON scale_eval_runs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_eval_runs TO vault_app;

CREATE TABLE scale_migration_drills (
  migration_drill_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('full_roundtrip', 'latest_down_up', 'schema_hash')),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  schema_hash_before char(64) NOT NULL CHECK (schema_hash_before ~ '^[0-9a-f]{64}$'),
  schema_hash_after char(64) NOT NULL CHECK (schema_hash_after ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, migration_drill_id),
  CONSTRAINT fk_scale_migration_drills_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_migration_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_migration_drills FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_migration_drills_tenant ON scale_migration_drills
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_migration_drills TO vault_app;

CREATE TABLE scale_learning_events (
  learning_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN ('validation_failure', 'optimization', 'release_boundary', 'drift', 'gate')
  ),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pattern_code text NOT NULL CHECK (pattern_code ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  resolution_ref text NOT NULL CHECK (resolution_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, learning_event_id),
  CONSTRAINT fk_scale_learning_events_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_learning_events FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_learning_events_tenant ON scale_learning_events
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_learning_events TO vault_app;

CREATE TABLE scale_ai_gate_reviews (
  ai_gate_review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  candidate_route text NOT NULL CHECK (candidate_route IN ('local_gemma', 'external_model')),
  decision text NOT NULL CHECK (decision IN ('external_blocked', 'deferred', 'local_only')),
  external_model_allowed boolean NOT NULL DEFAULT false CHECK (external_model_allowed = false),
  control_hash char(64) NOT NULL CHECK (control_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ai_gate_review_id),
  CONSTRAINT scale_ai_gate_route_decision_check CHECK (
    candidate_route <> 'external_model' OR decision <> 'local_only'
  ),
  CONSTRAINT fk_scale_ai_gate_reviews_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE scale_ai_gate_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_ai_gate_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_scale_ai_gate_reviews_tenant ON scale_ai_gate_reviews
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON scale_ai_gate_reviews TO vault_app;

COMMENT ON TABLE scale_performance_runs IS
  'R14 performance evidence. Stores scenario, percentiles, target, measurement hash, and evidence ref only.';
COMMENT ON TABLE scale_cost_snapshots IS
  'R14 cost evidence. Stores bounded units, estimated cents, cost model hash, and evidence ref only; no vendor account or billing secret.';
COMMENT ON TABLE scale_eval_runs IS
  'R14 evaluation pipeline evidence. Stores suite counts and metric hash only, not prompt, response, or source text.';
COMMENT ON TABLE scale_migration_drills IS
  'R14 migration tooling evidence. Stores schema hashes, duration, status, and evidence ref only.';
COMMENT ON TABLE scale_learning_events IS
  'R14 learning ledger event refs. Stores pattern code and evidence/resolution refs only, no incident body.';
COMMENT ON TABLE scale_ai_gate_reviews IS
  'R14 advanced AI gate review refs. External model allowed remains hard false; no external model calls or credentials.';

-- Down Migration

DROP TABLE IF EXISTS scale_ai_gate_reviews;
DROP TABLE IF EXISTS scale_learning_events;
DROP TABLE IF EXISTS scale_migration_drills;
DROP TABLE IF EXISTS scale_eval_runs;
DROP TABLE IF EXISTS scale_cost_snapshots;
DROP TABLE IF EXISTS scale_performance_runs;

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
      'GRAPH_SYNCED',
      'GRAPH_QUERY_EXECUTED',
      'GRAPH_CONSISTENCY_CHECKED',
      'CONTRACT_CLASSIFIED',
      'CONTRACT_CLAUSES_EXTRACTED',
      'CONTRACT_TERMS_EXTRACTED',
      'CONTRACT_REDLINE_PARSED',
      'PLAYBOOK_RULE_CHANGED',
      'CONTRACT_RULE_EVALUATED',
      'CONTRACT_CLAUSE_BANK_VIEWED',
      'DD_RFI_CHANGED',
      'DD_DATA_ROOM_MAPPED',
      'DD_ISSUE_CHANGED',
      'DD_RISK_CHANGED',
      'DD_TRACE_VIEWED',
      'LIT_EVIDENCE_CHANGED',
      'LIT_FACT_CHANGED',
      'LIT_ISSUE_TREE_CHANGED',
      'LIT_PLEADING_CHANGED',
      'LIT_CASE_MAP_VIEWED',
      'EXTERNAL_USER_CHANGED',
      'EXTERNAL_WORKSPACE_CHANGED',
      'EXTERNAL_LINK_CREATED',
      'EXTERNAL_LINK_REVOKED',
      'EXTERNAL_LINK_ACCESSED',
      'EXTERNAL_NDA_ACCEPTED',
      'EXTERNAL_DLP_WARNING_BLOCKED',
      'EXTERNAL_DLP_WARNING_ACCEPTED',
      'EXTERNAL_DOWNLOAD_REQUESTED',
      'EXTERNAL_QA_MESSAGE_RECORDED',
      'RETENTION_POLICY_CHANGED',
      'LEGAL_HOLD_APPLIED',
      'LEGAL_HOLD_RELEASED',
      'RECORD_ARCHIVED',
      'DISPOSAL_REQUESTED',
      'DISPOSAL_APPROVED',
      'DISPOSAL_EXECUTED',
      'DISPOSAL_CERTIFICATE_CREATED',
      'SSO_PROVIDER_CHANGED',
      'SSO_METADATA_VIEWED',
      'BYOK_KEY_REFERENCE_CHANGED',
      'SIEM_EXPORT_RECORDED',
      'BACKUP_SNAPSHOT_RECORDED',
      'COMPLIANCE_EVIDENCE_RECORDED',
      'ENTERPRISE_READINESS_VIEWED',
      'SCALE_PERFORMANCE_RECORDED',
      'SCALE_COST_SNAPSHOT_RECORDED',
      'SCALE_EVAL_RUN_RECORDED',
      'SCALE_MIGRATION_DRILL_RECORDED',
      'SCALE_LEARNING_EVENT_RECORDED',
      'ADVANCED_AI_GATE_REVIEWED',
      'SCALE_READINESS_VIEWED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );
