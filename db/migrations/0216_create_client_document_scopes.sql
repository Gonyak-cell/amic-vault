-- Up Migration
CREATE TABLE client_document_scopes (
  client_scope_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  os_tenant_id text NOT NULL CHECK (length(os_tenant_id) BETWEEN 1 AND 256),
  party_id text NOT NULL CHECK (length(party_id) BETWEEN 1 AND 256),
  workspace_ref text NOT NULL CHECK (workspace_ref ~ '^workspace:client:[0-9a-f]{32}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_scope_id),
  UNIQUE (tenant_id, os_tenant_id, party_id),
  UNIQUE (tenant_id, workspace_ref),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, user_id) ON DELETE RESTRICT
);
ALTER TABLE client_document_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_document_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_client_document_scopes_tenant ON client_document_scopes
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON client_document_scopes TO vault_app;

ALTER TABLE documents ADD COLUMN client_scope_id uuid;
ALTER TABLE documents ADD COLUMN client_document_metadata jsonb;
ALTER TABLE documents ADD COLUMN client_metadata_revision integer NOT NULL DEFAULT 0 CHECK (client_metadata_revision >= 0);
GRANT UPDATE (client_document_metadata, client_metadata_revision) ON documents TO vault_app;
ALTER TABLE documents ALTER COLUMN matter_id DROP NOT NULL;
ALTER TABLE documents ADD CONSTRAINT documents_scope_exclusive CHECK ((matter_id IS NULL) <> (client_scope_id IS NULL));
ALTER TABLE documents ADD CONSTRAINT documents_client_scope_fk FOREIGN KEY (tenant_id, client_scope_id)
  REFERENCES client_document_scopes(tenant_id, client_scope_id) ON DELETE RESTRICT;
CREATE INDEX idx_documents_client_scope ON documents(tenant_id, client_scope_id, created_at DESC, document_id)
  WHERE client_scope_id IS NOT NULL;

ALTER TABLE file_security_scans ADD COLUMN client_scope_id uuid;
ALTER TABLE file_security_scans ALTER COLUMN matter_id DROP NOT NULL;
ALTER TABLE file_security_scans ADD CONSTRAINT file_security_scans_scope_exclusive CHECK ((matter_id IS NULL) <> (client_scope_id IS NULL));
ALTER TABLE file_security_scans ADD CONSTRAINT file_security_scans_client_scope_fk FOREIGN KEY (tenant_id, client_scope_id)
  REFERENCES client_document_scopes(tenant_id, client_scope_id) ON DELETE RESTRICT;

CREATE TABLE client_document_uploads (
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_scope_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  scan_id uuid NOT NULL,
  document_id uuid,
  expected_version_id uuid,
  filename text NOT NULL,
  normalized_filename text NOT NULL,
  mime_type text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, upload_id),
  UNIQUE (tenant_id, client_scope_id, actor_id, idempotency_key),
  FOREIGN KEY (tenant_id, client_scope_id) REFERENCES client_document_scopes(tenant_id, client_scope_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, scan_id) REFERENCES file_security_scans(tenant_id, scan_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents(tenant_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, expected_version_id) REFERENCES document_versions(tenant_id, version_id) ON DELETE RESTRICT,
  CHECK ((document_id IS NULL) = (expected_version_id IS NULL))
);
ALTER TABLE client_document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_document_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_client_document_uploads_tenant ON client_document_uploads
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON client_document_uploads TO vault_app;

CREATE FUNCTION app_protect_client_document_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.matter_id IS DISTINCT FROM NEW.matter_id
    OR OLD.client_scope_id IS DISTINCT FROM NEW.client_scope_id THEN
    RAISE EXCEPTION 'document scope is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_documents_client_scope_immutable BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION app_protect_client_document_scope();
CREATE TRIGGER trg_scans_client_scope_immutable BEFORE UPDATE ON file_security_scans
  FOR EACH ROW EXECUTE FUNCTION app_protect_client_document_scope();


DO $$
DECLARE actions text;
BEGIN
  SELECT string_agg(quote_literal(action), ', ') INTO actions FROM (
    SELECT DISTINCT match[1] AS action FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid='audit_events'::regclass AND c.conname='audit_events_action_check'
    UNION SELECT unnest(ARRAY['CLIENT_DOCUMENT_SCOPE_RESOLVED','CLIENT_DOCUMENT_LISTED','CLIENT_DOCUMENT_UPLOAD_READBACK'])
  ) a;
  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || actions || ']::text[]))';
END $$;

-- Down Migration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM client_document_scopes) THEN
    RAISE EXCEPTION 'cannot rollback 0216 while client scopes exist';
  END IF;
END $$;
DO $$
DECLARE actions text;
BEGIN
  SELECT string_agg(quote_literal(action), ', ') INTO actions FROM (
    SELECT DISTINCT match[1] AS action FROM pg_constraint c
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS match
    WHERE c.conrelid='audit_events'::regclass AND c.conname='audit_events_action_check'
      AND match[1] <> ALL (ARRAY['CLIENT_DOCUMENT_SCOPE_RESOLVED','CLIENT_DOCUMENT_LISTED','CLIENT_DOCUMENT_UPLOAD_READBACK'])
  ) a;
  EXECUTE 'ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check';
  EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action = ANY (ARRAY[' || actions || ']::text[]))';
END $$;
DROP TRIGGER trg_scans_client_scope_immutable ON file_security_scans;
DROP TRIGGER trg_documents_client_scope_immutable ON documents;
DROP FUNCTION app_protect_client_document_scope();
DROP TABLE client_document_uploads;
ALTER TABLE file_security_scans DROP CONSTRAINT file_security_scans_client_scope_fk;
ALTER TABLE file_security_scans DROP CONSTRAINT file_security_scans_scope_exclusive;
ALTER TABLE file_security_scans DROP COLUMN client_scope_id;
ALTER TABLE file_security_scans ALTER COLUMN matter_id SET NOT NULL;
ALTER TABLE documents DROP CONSTRAINT documents_client_scope_fk;
ALTER TABLE documents DROP CONSTRAINT documents_scope_exclusive;
ALTER TABLE documents DROP COLUMN client_document_metadata;
ALTER TABLE documents DROP COLUMN client_metadata_revision;
ALTER TABLE documents DROP COLUMN client_scope_id;
ALTER TABLE documents ALTER COLUMN matter_id SET NOT NULL;
DROP TABLE client_document_scopes;
