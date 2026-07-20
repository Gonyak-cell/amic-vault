-- Up Migration

ALTER TABLE ai_policies
  ADD COLUMN summary_generation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN session_payload_preservation_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_policies.summary_generation_enabled IS
  'Tenant policy row gate for local Gemma summary and matter Q&A generation. False means evidence-only fallback.';

COMMENT ON COLUMN ai_policies.session_payload_preservation_enabled IS
  'Policy intent flag for future E5 payload preservation. This migration does not store raw prompts or responses.';

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
    default_effect,
    summary_generation_enabled,
    session_payload_preservation_enabled
  )
  SELECT
    tenant_id,
    'AMIC local matter QA generation',
    ARRAY['local']::text[],
    false,
    'DENY',
    true,
    true
  FROM active_tenants t
  WHERE NOT EXISTS (
    SELECT 1
    FROM ai_policies p
    WHERE p.tenant_id = t.tenant_id
      AND p.name = 'AMIC local matter QA generation'
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
    WHERE name = 'AMIC local matter QA generation'
      AND allowed_model_tiers = ARRAY['local']::text[]
      AND external_model_allowed = false
      AND default_effect = 'DENY'
  ) policies
  ORDER BY tenant_id, updated_at DESC, created_at DESC, policy_id
)
UPDATE matters m
SET ai_policy_id = p.policy_id,
    updated_at = now()
FROM default_policies p
WHERE m.tenant_id = p.tenant_id
  AND m.ai_policy_id IS NULL;

UPDATE ai_policies p
SET summary_generation_enabled = true,
    session_payload_preservation_enabled = true,
    updated_at = now()
WHERE p.tenant_id IN (
    SELECT tenant_id
    FROM tenants
    WHERE status = 'active'
  )
  AND p.allowed_model_tiers @> ARRAY['local']::text[]
  AND p.external_model_allowed = false
  AND p.default_effect = 'DENY'
  AND p.name IN (
    'AMIC local file organization prep',
    'AMIC local matter QA generation'
  );

INSERT INTO ai_model_access_policies (
  tenant_id,
  route_key,
  model_tier,
  status,
  external_model_allowed
)
SELECT
  tenant_id,
  'local_gemma',
  'local',
  'enabled',
  false
FROM tenants
WHERE status = 'active'
ON CONFLICT (tenant_id, route_key)
DO UPDATE SET
  model_tier = 'local',
  status = 'enabled',
  external_model_allowed = false,
  updated_at = now();

-- Down Migration

UPDATE matters m
SET ai_policy_id = NULL,
    updated_at = now()
FROM ai_policies p
WHERE m.tenant_id = p.tenant_id
  AND m.ai_policy_id = p.policy_id
  AND p.name = 'AMIC local matter QA generation'
  AND p.allowed_model_tiers = ARRAY['local']::text[]
  AND p.external_model_allowed = false
  AND p.default_effect = 'DENY';

DELETE FROM ai_policies p
WHERE p.name = 'AMIC local matter QA generation'
  AND p.allowed_model_tiers = ARRAY['local']::text[]
  AND p.external_model_allowed = false
  AND p.default_effect = 'DENY'
  AND NOT EXISTS (
    SELECT 1
    FROM matters m
    WHERE m.tenant_id = p.tenant_id
      AND m.ai_policy_id = p.policy_id
  );

ALTER TABLE ai_policies
  DROP COLUMN IF EXISTS session_payload_preservation_enabled,
  DROP COLUMN IF EXISTS summary_generation_enabled;
