-- Up Migration

CREATE TABLE tenant_email_domains (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  domain_ref text NOT NULL CHECK (
    char_length(domain_ref) BETWEEN 1 AND 255
    AND domain_ref = lower(domain_ref)
    AND domain_ref ~ '^[a-z0-9.-]+$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, domain_ref)
);

ALTER TABLE tenant_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_domains FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_tenant_email_domains_tenant ON tenant_email_domains
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON tenant_email_domains TO vault_app;

ALTER TABLE email_participants
  ADD COLUMN participant_class text NOT NULL DEFAULT 'other_external'
  CHECK (participant_class IN ('internal', 'client', 'opposing', 'other_external'));

UPDATE email_participants
SET participant_class = CASE WHEN is_outside THEN 'other_external' ELSE 'internal' END;

CREATE INDEX idx_email_participants_tenant_class
  ON email_participants (tenant_id, participant_class);

CREATE INDEX idx_email_participants_email_class
  ON email_participants (tenant_id, email_id, participant_class);

COMMENT ON TABLE tenant_email_domains IS
  'Server-side tenant email domain settings used for email participant classification. Raw email addresses are never stored here.';

COMMENT ON COLUMN email_participants.participant_class IS
  'Derived display and routing class for hashed email participants: internal, client, opposing, or other_external.';

-- Down Migration

DROP INDEX IF EXISTS idx_email_participants_email_class;
DROP INDEX IF EXISTS idx_email_participants_tenant_class;

ALTER TABLE email_participants
  DROP COLUMN IF EXISTS participant_class;

DROP TABLE IF EXISTS tenant_email_domains;
