-- Up Migration

CREATE TABLE documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  matter_id uuid NOT NULL,
  document_family_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'internal_review',
        'client_sent',
        'counterparty_sent',
        'markup_received',
        'negotiation',
        'final',
        'executed',
        'archived',
        'disposal_locked',
        'deleted'
      )
    ),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_id),
  CONSTRAINT fk_documents_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_documents_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_documents_matter ON documents (tenant_id, matter_id, created_at DESC, document_id);
CREATE INDEX idx_documents_family ON documents (tenant_id, document_family_id);
CREATE INDEX idx_documents_status ON documents (tenant_id, status);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_documents_tenant ON documents
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON documents TO vault_app;

-- Down Migration

DROP TABLE IF EXISTS documents;
