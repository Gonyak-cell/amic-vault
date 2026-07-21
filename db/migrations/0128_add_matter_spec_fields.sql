-- Up Migration

ALTER TABLE matters
  ADD COLUMN confidentiality_level text NOT NULL DEFAULT 'standard'
    CONSTRAINT matters_confidentiality_level_check
    CHECK (confidentiality_level IN ('standard', 'high', 'restricted')),
  ADD COLUMN lead_partner_id uuid,
  ADD COLUMN lead_associate_id uuid;

UPDATE matters
SET lead_partner_id = lead_lawyer_id,
    updated_at = now()
WHERE lead_lawyer_id IS NOT NULL
  AND lead_partner_id IS NULL;

ALTER TABLE matters
  ADD CONSTRAINT fk_matters_lead_partner
    FOREIGN KEY (tenant_id, lead_partner_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_matters_lead_associate
    FOREIGN KEY (tenant_id, lead_associate_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_matters_tenant_confidentiality
  ON matters (tenant_id, confidentiality_level, matter_id);

CREATE INDEX idx_matters_tenant_lead_partner
  ON matters (tenant_id, lead_partner_id)
  WHERE lead_partner_id IS NOT NULL;

CREATE INDEX idx_matters_tenant_lead_associate
  ON matters (tenant_id, lead_associate_id)
  WHERE lead_associate_id IS NOT NULL;

GRANT UPDATE (confidentiality_level, lead_partner_id, lead_associate_id, lead_lawyer_id, updated_at)
  ON matters TO vault_app;

CREATE TABLE related_matters (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  related_matter_id uuid NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('preceding', 'parallel', 'subsequent')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, link_id),
  UNIQUE (tenant_id, matter_id, related_matter_id, relation_type),
  CHECK (matter_id <> related_matter_id),
  CONSTRAINT fk_related_matters_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_related_matters_related
    FOREIGN KEY (tenant_id, related_matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_related_matters_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_related_matters_tenant_matter
  ON related_matters (tenant_id, matter_id, created_at DESC);

CREATE INDEX idx_related_matters_tenant_related
  ON related_matters (tenant_id, related_matter_id, created_at DESC);

ALTER TABLE related_matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE related_matters FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_related_matters_tenant ON related_matters
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON related_matters TO vault_app;

COMMENT ON COLUMN matters.confidentiality_level IS
  'Matter-level 3-step confidentiality classification. Documents inherit this value when upload metadata does not specify a document confidentiality level.';
COMMENT ON COLUMN matters.lead_partner_id IS
  'Matter lead partner. Backfilled from lead_lawyer_id for compatibility; lead_lawyer_id remains a legacy alias.';
COMMENT ON COLUMN matters.lead_associate_id IS
  'Matter lead associate for working-responsibility display and filtering.';
COMMENT ON TABLE related_matters IS
  'Tenant-scoped Matter relation links. Stores identifiers and relation type only; display labels are derived through permission-checked Matter reads.';

-- Down Migration

DROP TABLE IF EXISTS related_matters;

DROP INDEX IF EXISTS idx_matters_tenant_lead_associate;
DROP INDEX IF EXISTS idx_matters_tenant_lead_partner;
DROP INDEX IF EXISTS idx_matters_tenant_confidentiality;

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS fk_matters_lead_associate,
  DROP CONSTRAINT IF EXISTS fk_matters_lead_partner,
  DROP COLUMN IF EXISTS lead_associate_id,
  DROP COLUMN IF EXISTS lead_partner_id,
  DROP COLUMN IF EXISTS confidentiality_level;
