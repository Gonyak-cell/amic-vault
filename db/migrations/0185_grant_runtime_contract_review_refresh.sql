-- Up Migration

-- Existing pending-finding materialization refreshes only these fields on
-- conflict. RLS and accepted-finding immutability remain authoritative.
GRANT UPDATE (severity, finding_code, finding_hash, updated_at)
  ON contract_ai_review_findings TO vault_app;

-- Down Migration

REVOKE UPDATE (severity, finding_code, finding_hash, updated_at)
  ON contract_ai_review_findings FROM vault_app;
