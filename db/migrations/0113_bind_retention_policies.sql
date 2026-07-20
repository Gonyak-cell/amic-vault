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
    SELECT 'RETENTION_REVIEW_SCHEDULED'
  ) actions;

  SELECT string_agg(quote_literal(action_name), ', ')
  INTO action_list
  FROM unnest(action_values) AS values(action_name);

  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || action_list || ']::text[]))';
END $$;

ALTER TABLE matters
  ADD COLUMN retention_policy_id uuid,
  ADD CONSTRAINT fk_matters_retention_policy
    FOREIGN KEY (tenant_id, retention_policy_id)
    REFERENCES retention_policies (tenant_id, retention_policy_id)
    ON DELETE RESTRICT;

ALTER TABLE documents
  ADD COLUMN retention_policy_id uuid,
  ADD CONSTRAINT fk_documents_retention_policy
    FOREIGN KEY (tenant_id, retention_policy_id)
    REFERENCES retention_policies (tenant_id, retention_policy_id)
    ON DELETE RESTRICT;

ALTER TABLE enterprise_dms_matter_templates
  ADD COLUMN default_retention_policy_id uuid,
  ADD CONSTRAINT fk_enterprise_dms_matter_templates_retention_policy
    FOREIGN KEY (tenant_id, default_retention_policy_id)
    REFERENCES retention_policies (tenant_id, retention_policy_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_matters_tenant_retention_policy
  ON matters (tenant_id, retention_policy_id, closed_at)
  WHERE retention_policy_id IS NOT NULL;

CREATE INDEX idx_documents_tenant_retention_policy
  ON documents (tenant_id, retention_policy_id, matter_id)
  WHERE retention_policy_id IS NOT NULL;

GRANT UPDATE (retention_policy_id, updated_at) ON matters TO vault_app;
GRANT UPDATE (retention_policy_id, updated_at) ON documents TO vault_app;
GRANT UPDATE (default_retention_policy_id, updated_by, updated_at)
  ON enterprise_dms_matter_templates TO vault_app;

COMMENT ON COLUMN matters.retention_policy_id IS
  'Optional Matter-level records retention policy binding. H8 scheduler uses it to create review-only disposal requests after closed_at + retention_days.';
COMMENT ON COLUMN documents.retention_policy_id IS
  'Optional document retention policy override. NULL inherits the Matter-level retention policy.';
COMMENT ON COLUMN enterprise_dms_matter_templates.default_retention_policy_id IS
  'Optional default retention policy for Matter-type document-set templates. No automatic deletion is performed.';

-- Down Migration

DROP INDEX IF EXISTS idx_documents_tenant_retention_policy;
DROP INDEX IF EXISTS idx_matters_tenant_retention_policy;

ALTER TABLE enterprise_dms_matter_templates
  DROP CONSTRAINT IF EXISTS fk_enterprise_dms_matter_templates_retention_policy,
  DROP COLUMN IF EXISTS default_retention_policy_id;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS fk_documents_retention_policy,
  DROP COLUMN IF EXISTS retention_policy_id;

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS fk_matters_retention_policy,
  DROP COLUMN IF EXISTS retention_policy_id;

-- Keep RETENTION_REVIEW_SCHEDULED in the audit action constraint on rollback.
-- Audit events are append-only, so historical H8 review rows must remain valid.
