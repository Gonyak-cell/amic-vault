-- Up Migration

CREATE TABLE enterprise_dms_matter_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_type text NOT NULL CHECK (
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
  display_name text NOT NULL CHECK (
    char_length(display_name) BETWEEN 1 AND 200
    AND display_name !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)'
  ),
  description text CHECK (
    description IS NULL OR (
      char_length(description) <= 400
      AND description !~* '(password|secret|token|api[_ -]?key|body|snippet|raw|prompt|response|model)'
    )
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  document_sets_json jsonb NOT NULL CHECK (
    jsonb_typeof(document_sets_json) = 'array'
    AND jsonb_array_length(document_sets_json) BETWEEN 1 AND 20
  ),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_id),
  UNIQUE (tenant_id, matter_type),
  CONSTRAINT fk_enterprise_dms_matter_templates_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_matter_templates_updated_by
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_dms_matter_templates_tenant_status
  ON enterprise_dms_matter_templates (tenant_id, status, matter_type);

ALTER TABLE enterprise_dms_matter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_dms_matter_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_dms_matter_templates_tenant
  ON enterprise_dms_matter_templates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_dms_matter_templates TO vault_app;
GRANT UPDATE (
  display_name, description, status, document_sets_json, updated_by, updated_at
) ON enterprise_dms_matter_templates TO vault_app;

CREATE TABLE enterprise_dms_matter_template_applications (
  application_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  template_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  matter_type text NOT NULL CHECK (
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
  document_set_count integer NOT NULL CHECK (document_set_count BETWEEN 1 AND 20),
  applied_by uuid NOT NULL,
  audit_event_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, application_id),
  UNIQUE (tenant_id, matter_id),
  CONSTRAINT fk_enterprise_dms_matter_template_applications_template
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES enterprise_dms_matter_templates (tenant_id, template_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_matter_template_applications_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enterprise_dms_matter_template_applications_applied_by
    FOREIGN KEY (tenant_id, applied_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_enterprise_dms_matter_template_applications_tenant_template
  ON enterprise_dms_matter_template_applications (tenant_id, template_id, applied_at DESC);

ALTER TABLE enterprise_dms_matter_template_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_dms_matter_template_applications FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_enterprise_dms_matter_template_applications_tenant
  ON enterprise_dms_matter_template_applications
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON enterprise_dms_matter_template_applications TO vault_app;
GRANT UPDATE (
  template_id, matter_type, document_set_count, applied_by, audit_event_id, applied_at
) ON enterprise_dms_matter_template_applications TO vault_app;

COMMENT ON TABLE enterprise_dms_matter_templates IS
  'Tenant DMS Matter-type document-set template contracts. Stores bounded configuration labels only; no folder objects, document body, snippets, prompts, model responses, or private endpoints.';
COMMENT ON COLUMN enterprise_dms_matter_templates.document_sets_json IS
  'Approved document-set semantics for a Matter type. This is not a virtual folder tree.';
COMMENT ON TABLE enterprise_dms_matter_template_applications IS
  'Audited receipt that a tenant-admin Matter template contract was applied to a Matter. Stores references and counts only.';
COMMENT ON COLUMN enterprise_dms_matter_template_applications.audit_event_id IS
  'Reference-only audit event UUID for this template application.';

-- Down Migration

DROP TABLE IF EXISTS enterprise_dms_matter_template_applications;
DROP TABLE IF EXISTS enterprise_dms_matter_templates;
