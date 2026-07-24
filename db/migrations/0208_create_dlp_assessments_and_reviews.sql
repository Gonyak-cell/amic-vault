-- Up Migration

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
    UNION
    SELECT unnest(ARRAY[
      'DLP_REVIEW_RECORDED',
      'DLP_REVIEW_APPLIED'
    ])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

CREATE TABLE dlp_scan_assessments (
  assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (
    source_type IN ('document', 'email', 'attachment', 'text', 'email_egress', 'model_egress')
  ),
  source_id uuid NOT NULL,
  matter_id uuid,
  document_id uuid,
  version_id uuid,
  scan_state text NOT NULL CHECK (scan_state IN ('clean', 'findings', 'unscannable')),
  reason_code text CHECK (
    reason_code IS NULL OR reason_code IN (
      'assessment_missing',
      'text_pending',
      'ocr_pending',
      'no_text',
      'parser_failed',
      'password_protected',
      'input_oversize',
      'scan_limit_reached'
    )
  ),
  finding_count integer NOT NULL CHECK (finding_count >= 0 AND finding_count <= 200),
  restricted_finding_count integer NOT NULL
    CHECK (restricted_finding_count >= 0 AND restricted_finding_count <= finding_count),
  requires_review boolean NOT NULL,
  policy_version text NOT NULL CHECK (policy_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  result_hash char(64) NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, assessment_id),
  UNIQUE (tenant_id, source_type, source_id, policy_version, result_hash),
  CONSTRAINT fk_dlp_scan_assessments_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dlp_scan_assessments_document
    FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dlp_scan_assessments_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CONSTRAINT dlp_scan_assessments_state_check CHECK (
    (
      scan_state = 'clean'
      AND reason_code IS NULL
      AND finding_count = 0
      AND restricted_finding_count = 0
      AND requires_review = false
    )
    OR (
      scan_state = 'findings'
      AND reason_code IS NULL
      AND finding_count > 0
    )
    OR (
      scan_state = 'unscannable'
      AND reason_code IS NOT NULL
      AND requires_review = true
    )
  )
);

CREATE INDEX idx_dlp_scan_assessments_tenant_source
  ON dlp_scan_assessments (
    tenant_id, source_type, source_id, created_at DESC, assessment_id DESC
  );

CREATE INDEX idx_dlp_scan_assessments_tenant_document
  ON dlp_scan_assessments (
    tenant_id, document_id, version_id, created_at DESC, assessment_id DESC
  )
  WHERE document_id IS NOT NULL;

ALTER TABLE dlp_scan_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_scan_assessments FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dlp_scan_assessments_tenant ON dlp_scan_assessments
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dlp_scan_assessments TO vault_app;

COMMENT ON TABLE dlp_scan_assessments IS
  'Append-only exact-source DLP scan state. Raw matched values, snippets, text, filenames, paths, URLs, tokens, and credentials are forbidden.';

CREATE TABLE dlp_review_decisions (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow', 'deny')),
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'verified_safe',
      'known_encrypted_source',
      'business_justified',
      'sensitive_content_denied'
    )
  ),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, review_id),
  CONSTRAINT fk_dlp_review_decisions_assessment
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES dlp_scan_assessments (tenant_id, assessment_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_dlp_review_decisions_reviewer
    FOREIGN KEY (tenant_id, reviewer_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (expires_at > reviewed_at),
  CHECK (expires_at <= reviewed_at + interval '30 days')
);

CREATE INDEX idx_dlp_review_decisions_current
  ON dlp_review_decisions (
    tenant_id, assessment_id, reviewed_at DESC, review_id DESC
  );

ALTER TABLE dlp_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_review_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dlp_review_decisions_tenant ON dlp_review_decisions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON dlp_review_decisions TO vault_app;

COMMENT ON TABLE dlp_review_decisions IS
  'Append-only, expiring reviewer decisions bound to one exact DLP assessment. Free-form notes and raw content are forbidden.';

-- Down Migration

DROP TABLE IF EXISTS dlp_review_decisions;
DROP TABLE IF EXISTS dlp_scan_assessments;

DO $$
DECLARE
  action_values text[];
  action_list text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE action IN ('DLP_REVIEW_RECORDED', 'DLP_REVIEW_APPLIED')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove DLP review audit actions while append-only audit rows exist';
  END IF;

  SELECT array_agg(action_name ORDER BY action_name)
  INTO action_values
  FROM (
    SELECT DISTINCT match[1] AS action_name
    FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid = 'audit_events'::regclass
      AND c.conname = 'audit_events_action_check'
      AND match[1] <> ALL (ARRAY[
        'DLP_REVIEW_RECORDED',
        'DLP_REVIEW_APPLIED'
      ])
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;
