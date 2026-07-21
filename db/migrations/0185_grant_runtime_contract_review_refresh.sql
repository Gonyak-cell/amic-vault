-- Up Migration

-- Existing contract-review materialization refreshes only these fields on its
-- tenant-scoped conflict path. Preserve RLS and immutable accepted findings.
GRANT UPDATE (severity, finding_code, finding_hash, updated_at)
  ON contract_ai_review_findings TO vault_app;

-- Down Migration

REVOKE UPDATE (severity, finding_code, finding_hash, updated_at)
  ON contract_ai_review_findings FROM vault_app;
