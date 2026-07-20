-- Up Migration

CREATE TABLE dd_rfi_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id) ON DELETE RESTRICT,
  template_code text NOT NULL CHECK (
    char_length(template_code) BETWEEN 2 AND 64
    AND template_code ~ '^[a-z0-9_:-]+$'
  ),
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('ma_basic', 'ma_lite')
  ),
  name text NOT NULL CHECK (
    char_length(name) BETWEEN 1 AND 160
    AND name !~* '(password|secret|token)'
  ),
  items_json jsonb NOT NULL CHECK (
    jsonb_typeof(items_json) = 'array'
    AND jsonb_array_length(items_json) BETWEEN 1 AND 100
    AND octet_length(items_json::text) <= 65536
    AND items_json::text !~* '(password|secret|token)'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_id),
  UNIQUE (tenant_id, template_code)
);

CREATE INDEX idx_dd_rfi_templates_tenant_type
  ON dd_rfi_templates (tenant_id, transaction_type, template_code);

ALTER TABLE dd_rfi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_rfi_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_dd_rfi_templates_tenant ON dd_rfi_templates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT ON dd_rfi_templates TO vault_app;

INSERT INTO dd_rfi_templates (
  tenant_id,
  template_code,
  transaction_type,
  name,
  items_json
)
SELECT
  tenant_id,
  'ma_basic',
  'ma_basic',
  'M&A basic due diligence',
  '[
    {
      "rfi_code": "MA.CORP.01",
      "category": "corporate",
      "title": "Corporate registry extract",
      "description": "Current corporate registry and charter package.",
      "priority": "high"
    },
    {
      "rfi_code": "MA.FIN.01",
      "category": "finance",
      "title": "Recent financial statements",
      "description": "Audited or management financial statements for the review period.",
      "priority": "high"
    },
    {
      "rfi_code": "MA.LIT.01",
      "category": "litigation",
      "title": "Material disputes schedule",
      "description": "Pending or threatened claims, disputes, and regulatory proceedings.",
      "priority": "medium"
    },
    {
      "rfi_code": "MA.EMP.01",
      "category": "employment",
      "title": "Key employee agreements",
      "description": "Executive, founder, and key employee agreements.",
      "priority": "medium"
    }
  ]'::jsonb
FROM tenants
ON CONFLICT (tenant_id, template_code) DO NOTHING;

INSERT INTO dd_rfi_templates (
  tenant_id,
  template_code,
  transaction_type,
  name,
  items_json
)
SELECT
  tenant_id,
  'ma_lite',
  'ma_lite',
  'M&A lite due diligence',
  '[
    {
      "rfi_code": "LITE.CORP.01",
      "category": "corporate",
      "title": "Corporate profile",
      "description": "Current corporate profile and ownership summary.",
      "priority": "medium"
    },
    {
      "rfi_code": "LITE.FIN.01",
      "category": "finance",
      "title": "Management accounts",
      "description": "Latest management accounts and debt summary.",
      "priority": "medium"
    }
  ]'::jsonb
FROM tenants
ON CONFLICT (tenant_id, template_code) DO NOTHING;

COMMENT ON TABLE dd_rfi_templates IS
  'Tenant-scoped DD RFI templates. Stores bounded request labels and metadata only; no document body, snippets, credentials, or external data-room archive content.';
COMMENT ON COLUMN dd_rfi_templates.items_json IS
  'Bounded array of request template refs: rfi_code, category, title, description, and priority only.';

-- Down Migration

DROP TABLE IF EXISTS dd_rfi_templates;
