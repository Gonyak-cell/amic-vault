-- Up Migration

-- Operator-approved production scope: local file organization prep only.
-- This keeps default_effect fail-closed, external_model_allowed=false, and
-- still requires per-document ai_allowed=true before any AI prep can run.

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
)
UPDATE matters m
SET ai_policy_id = p.policy_id,
    updated_at = now()
FROM default_policies p
WHERE m.tenant_id = p.tenant_id
  AND m.ai_policy_id IS NULL;

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

COMMENT ON TABLE ai_policies IS
  'AI policies remain fail-closed. The default local file organization prep policy permits only local model tier and still requires document ai_allowed=true.';

-- Down Migration

UPDATE matters m
SET ai_policy_id = NULL,
    updated_at = now()
FROM ai_policies p
WHERE m.tenant_id = p.tenant_id
  AND m.ai_policy_id = p.policy_id
  AND p.name = 'AMIC local file organization prep'
  AND p.allowed_model_tiers = ARRAY['local']::text[]
  AND p.external_model_allowed = false
  AND p.default_effect = 'DENY';

DELETE FROM ai_policies p
WHERE p.name = 'AMIC local file organization prep'
  AND p.allowed_model_tiers = ARRAY['local']::text[]
  AND p.external_model_allowed = false
  AND p.default_effect = 'DENY'
  AND NOT EXISTS (
    SELECT 1
    FROM matters m
    WHERE m.tenant_id = p.tenant_id
      AND m.ai_policy_id = p.policy_id
  );

UPDATE ai_model_access_policies
SET status = 'disabled',
    updated_at = now()
WHERE route_key = 'local_gemma'
  AND model_tier = 'local'
  AND external_model_allowed = false;
