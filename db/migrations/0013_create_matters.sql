-- Up Migration

CREATE TABLE matters (
  matter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  matter_code text NOT NULL CHECK (char_length(matter_code) BETWEEN 1 AND 120),
  matter_name text NOT NULL CHECK (char_length(matter_name) BETWEEN 1 AND 1000),
  matter_type text NOT NULL
    CONSTRAINT matters_matter_type_check CHECK (
      matter_type IN (
        'advisory',
        'contract',
        'ma',
        'litigation',
        'arbitration',
        'investigation',
        'compliance',
        'ip',
        'finance',
        'other'
      )
    ),
  status text NOT NULL DEFAULT 'proposed'
    CONSTRAINT matters_status_check CHECK (
      status IN (
        'proposed',
        'open',
        'active',
        'closing',
        'closed',
        'archived',
        'disposal_review',
        'disposed'
      )
    ),
  opened_at timestamptz,
  closed_at timestamptz,
  lead_lawyer_id uuid,
  practice_group text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matter_id),
  UNIQUE (tenant_id, matter_code),
  CONSTRAINT fk_matters_client
    FOREIGN KEY (tenant_id, client_id)
    REFERENCES clients (tenant_id, client_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matters_lead_lawyer
    FOREIGN KEY (tenant_id, lead_lawyer_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matters_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (closed_at IS NULL OR opened_at IS NULL OR closed_at >= opened_at),
  CHECK (jsonb_typeof(metadata_json) = 'object'),
  CHECK (NOT (metadata_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'password', 'token']))
);

CREATE INDEX idx_matters_tenant_client ON matters (tenant_id, client_id);
CREATE INDEX idx_matters_tenant_status ON matters (tenant_id, status);
CREATE INDEX idx_matters_tenant_lead ON matters (tenant_id, lead_lawyer_id);
CREATE INDEX idx_matters_tenant_opened ON matters (tenant_id, opened_at DESC NULLS LAST, matter_id);

ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matters_tenant ON matters
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON matters TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS matters;
