-- Up Migration

CREATE TABLE evaluation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  case_no text NOT NULL CHECK (case_no ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
  source_doc_ref text NOT NULL CHECK (char_length(source_doc_ref) BETWEEN 1 AND 256),
  case_type text NOT NULL CHECK (char_length(case_type) BETWEEN 1 AND 80),
  query_text text NOT NULL CHECK (char_length(query_text) BETWEEN 1 AND 2000),
  expected_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  deidentified boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_no),
  CHECK (jsonb_typeof(expected_refs) = 'array'),
  CHECK (deidentified),
  CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX idx_evaluation_cases_tenant_type
  ON evaluation_cases (tenant_id, case_type, case_no);

ALTER TABLE evaluation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_evaluation_cases_tenant ON evaluation_cases
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON evaluation_cases TO vault_app;
GRANT UPDATE (
  source_doc_ref,
  case_type,
  query_text,
  expected_refs,
  deidentified,
  notes,
  updated_at
) ON evaluation_cases TO vault_app;

COMMENT ON TABLE evaluation_cases IS
  'R3 deidentified evaluation set cases. Raw client, party, address, signature, and regulated identifier data must not be loaded.';

-- Down Migration

DROP TABLE IF EXISTS evaluation_cases;
