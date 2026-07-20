-- Up Migration

CREATE TABLE matter_intake_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  template_code text NOT NULL CHECK (template_code IN ('default_open', 'restricted')),
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 120
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|prompt|response)'
  ),
  description text CHECK (
    description IS NULL OR (
      char_length(description) <= 300
      AND description !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|prompt|response)'
    )
  ),
  default_access_scope text NOT NULL CHECK (default_access_scope IN ('firm_open', 'restricted')),
  default_ai_policy_id uuid,
  initial_member_policy_json jsonb NOT NULL DEFAULT '{"leadLawyer":"owner"}'::jsonb CHECK (
    jsonb_typeof(initial_member_policy_json) = 'object'
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_id),
  UNIQUE (tenant_id, template_code),
  CONSTRAINT fk_matter_intake_templates_ai_policy
    FOREIGN KEY (tenant_id, default_ai_policy_id)
    REFERENCES ai_policies (tenant_id, policy_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_matter_intake_templates_tenant_status
  ON matter_intake_templates (tenant_id, status, template_code);

ALTER TABLE matter_intake_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_intake_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_matter_intake_templates_tenant
  ON matter_intake_templates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT ON matter_intake_templates TO vault_app;

WITH active_tenants AS (
  SELECT tenant_id
  FROM tenants
  WHERE status = 'active'
),
inserted_policies AS (
  INSERT INTO ai_policies (
    tenant_id,
    name,
    allowed_model_tiers,
    external_model_allowed,
    default_effect
  )
  SELECT
    tenant_id,
    'AMIC local file organization prep',
    ARRAY['local']::text[],
    false,
    'DENY'
  FROM active_tenants t
  WHERE NOT EXISTS (
    SELECT 1
    FROM ai_policies p
    WHERE p.tenant_id = t.tenant_id
      AND p.name = 'AMIC local file organization prep'
      AND p.allowed_model_tiers = ARRAY['local']::text[]
      AND p.external_model_allowed = false
      AND p.default_effect = 'DENY'
  )
  RETURNING tenant_id, policy_id, updated_at, created_at
),
default_policies AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    policy_id
  FROM (
    SELECT tenant_id, policy_id, updated_at, created_at
    FROM inserted_policies
    UNION ALL
    SELECT tenant_id, policy_id, updated_at, created_at
    FROM ai_policies
    WHERE name = 'AMIC local file organization prep'
      AND allowed_model_tiers = ARRAY['local']::text[]
      AND external_model_allowed = false
      AND default_effect = 'DENY'
  ) policies
  ORDER BY tenant_id, updated_at DESC, created_at DESC, policy_id
),
template_seed AS (
  SELECT
    tenant_id,
    policy_id,
    'default_open'::text AS template_code,
    '기본개방 Matter'::text AS display_name,
    '펌 전체 열람과 로컬 파일 정리 준비 정책을 적용합니다.'::text AS description,
    'firm_open'::text AS default_access_scope
  FROM default_policies
  UNION ALL
  SELECT
    tenant_id,
    policy_id,
    'restricted'::text AS template_code,
    '제한 Matter'::text AS display_name,
    '명시된 Matter 구성원 중심으로 열람을 제한합니다.'::text AS description,
    'restricted'::text AS default_access_scope
  FROM default_policies
)
INSERT INTO matter_intake_templates (
  tenant_id,
  template_code,
  display_name,
  description,
  default_access_scope,
  default_ai_policy_id,
  initial_member_policy_json
)
SELECT
  tenant_id,
  template_code,
  display_name,
  description,
  default_access_scope,
  policy_id,
  '{"leadLawyer":"owner"}'::jsonb
FROM template_seed
ON CONFLICT (tenant_id, template_code)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  default_access_scope = EXCLUDED.default_access_scope,
  default_ai_policy_id = EXCLUDED.default_ai_policy_id,
  initial_member_policy_json = EXCLUDED.initial_member_policy_json,
  status = 'active',
  updated_at = now();

COMMENT ON TABLE matter_intake_templates IS
  'Fixed internal Matter intake policy templates. Separate from enterprise_dms_matter_templates, which stores matter-type document-set contracts.';
COMMENT ON COLUMN matter_intake_templates.default_ai_policy_id IS
  'Fail-closed local AI policy reference for future governance. This does not enable AI generation by itself.';
COMMENT ON COLUMN matter_intake_templates.initial_member_policy_json IS
  'Bounded member initialization rule. Current H1 templates add only the lead lawyer as owner.';

-- Down Migration

DROP TABLE IF EXISTS matter_intake_templates;
