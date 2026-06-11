-- Up Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED'
    )
  );

CREATE TABLE canonical_documents (
  canonical_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  version_id uuid NOT NULL,
  body_text text NOT NULL DEFAULT '',
  extraction_status text NOT NULL
    CHECK (extraction_status IN ('pending', 'ready', 'ocr_pending', 'failed')),
  extraction_method text NOT NULL
    CHECK (extraction_method IN ('pending', 'pdf_text', 'docx', 'hwpx', 'ocr_required', 'failed')),
  confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  failure_reason_code text CHECK (
    failure_reason_code IS NULL OR failure_reason_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canonical_id),
  UNIQUE (tenant_id, version_id),
  CONSTRAINT fk_canonical_documents_version
    FOREIGN KEY (tenant_id, version_id)
    REFERENCES document_versions (tenant_id, version_id)
    ON DELETE RESTRICT,
  CHECK (
    (extraction_status = 'failed' AND failure_reason_code IS NOT NULL AND body_text = '')
    OR extraction_status <> 'failed'
  ),
  CHECK (
    (extraction_status = 'pending' AND extracted_at IS NULL)
    OR extraction_status <> 'pending'
  )
);

CREATE INDEX idx_canonical_documents_tenant_status
  ON canonical_documents (tenant_id, extraction_status, updated_at DESC, canonical_id);

ALTER TABLE canonical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_canonical_documents_tenant ON canonical_documents
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON canonical_documents TO vault_app;
GRANT UPDATE (
  body_text,
  extraction_status,
  extraction_method,
  confidence,
  failure_reason_code,
  extracted_at,
  updated_at
) ON canonical_documents TO vault_app;

COMMENT ON TABLE canonical_documents IS
  'R2 canonical extracted text per document version. Text remains in DB only; logs and audit metadata store reference IDs and status codes only.';

-- Down Migration

DROP TABLE IF EXISTS canonical_documents;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R2 extraction actions have been recorded,
-- rollback cannot safely remove DOCUMENT_TEXT_EXTRACTED from the allow-list.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (
    action IN (
      'CLIENT_CREATED',
      'CLIENT_UPDATED',
      'MATTER_CREATED',
      'MATTER_UPDATED',
      'MATTER_STATUS_CHANGED',
      'MATTER_MEMBER_ADDED',
      'MATTER_MEMBER_REMOVED',
      'MATTER_MEMBER_ROLE_CHANGED',
      'PARTY_ADDED',
      'PARTY_RESTRICTED_MARKED',
      'ROLE_ASSIGNED',
      'ROLE_CHANGED',
      'PERMISSION_CHANGED',
      'ACCESS_DENIED',
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_VERSION_ADDED',
      'DOCUMENT_METADATA_CHANGED',
      'DOCUMENT_INTEGRITY_ALERT',
      'LEGAL_HOLD_CHANGED',
      'DOCUMENT_TEXT_EXTRACTED'
    )
  );
