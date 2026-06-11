-- Up Migration

CREATE TABLE ai_policies (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  allowed_model_tiers text[] NOT NULL DEFAULT ARRAY[]::text[],
  external_model_allowed boolean NOT NULL DEFAULT false
    CHECK (external_model_allowed = false),
  default_effect text NOT NULL DEFAULT 'DENY'
    CHECK (default_effect = 'DENY'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_id)
);

ALTER TABLE documents
  ADD COLUMN ai_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE matters
  ADD COLUMN ai_policy_id uuid,
  ADD CONSTRAINT fk_matters_ai_policy
    FOREIGN KEY (tenant_id, ai_policy_id)
    REFERENCES ai_policies (tenant_id, policy_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_ai_policies_tenant
  ON ai_policies (tenant_id, policy_id);

ALTER TABLE ai_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_policies_tenant ON ai_policies
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT ON ai_policies TO vault_app;

COMMENT ON TABLE ai_policies IS
  'R2 schema-only AI policy placeholder. Evaluation logic and AI endpoints are forbidden before R6.';
COMMENT ON COLUMN documents.ai_allowed IS
  'Schema-only flag defaulting to false. No R2 service/controller may branch on this column.';
COMMENT ON COLUMN matters.ai_policy_id IS
  'Nullable schema-only FK for future R6 AI governance evaluation.';

-- Down Migration

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS fk_matters_ai_policy,
  DROP COLUMN IF EXISTS ai_policy_id;

ALTER TABLE documents
  DROP COLUMN IF EXISTS ai_allowed;

DROP TABLE IF EXISTS ai_policies;
