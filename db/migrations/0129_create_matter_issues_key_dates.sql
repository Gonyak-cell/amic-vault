-- Up Migration

CREATE TABLE matter_issues (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 240
    AND title !~* '(password|secret|token)'
  ),
  summary text CHECK (
    summary IS NULL
    OR (
      char_length(summary) <= 2000
      AND summary !~* '(password|secret|token)'
    )
  ),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'resolved')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issue_id),
  CONSTRAINT fk_matter_issues_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_issues_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_issues_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_matter_issues_tenant_matter
  ON matter_issues (tenant_id, matter_id, status, risk_level, created_at DESC);

ALTER TABLE matter_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_issues FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_issues_tenant ON matter_issues
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON matter_issues TO vault_app;
GRANT UPDATE (
  title,
  summary,
  status,
  risk_level,
  updated_by,
  updated_at
) ON matter_issues TO vault_app;

CREATE TABLE matter_key_dates (
  key_date_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 240
    AND title !~* '(password|secret|token)'
  ),
  due_date date NOT NULL,
  date_type text NOT NULL DEFAULT 'internal' CHECK (date_type IN ('court', 'contractual', 'internal')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  assigned_to_user_id uuid,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key_date_id),
  CONSTRAINT fk_matter_key_dates_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_key_dates_assigned
    FOREIGN KEY (tenant_id, assigned_to_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_key_dates_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matter_key_dates_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_matter_key_dates_tenant_matter
  ON matter_key_dates (tenant_id, matter_id, status, due_date, key_date_id);
CREATE INDEX idx_matter_key_dates_tenant_assigned
  ON matter_key_dates (tenant_id, assigned_to_user_id, due_date)
  WHERE assigned_to_user_id IS NOT NULL;

ALTER TABLE matter_key_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_key_dates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_key_dates_tenant ON matter_key_dates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON matter_key_dates TO vault_app;
GRANT UPDATE (
  title,
  due_date,
  date_type,
  status,
  assigned_to_user_id,
  updated_by,
  updated_at
) ON matter_key_dates TO vault_app;

COMMENT ON TABLE matter_issues IS
  'Matter-core issues and risk levels visible across all matter types. Does not unlock DD or litigation vault routes.';
COMMENT ON TABLE matter_key_dates IS
  'Matter-core key dates across all matter types. Read APIs may union internal-only DD and litigation deadlines with source tags.';

-- Down Migration

DROP TABLE IF EXISTS matter_key_dates;
DROP TABLE IF EXISTS matter_issues;
