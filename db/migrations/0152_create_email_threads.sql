-- Up Migration

CREATE TABLE email_threads (
  thread_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  root_message_id_hash char(64) NOT NULL CHECK (root_message_id_hash ~ '^[0-9a-f]{64}$'),
  conversation_id_hash char(64) CHECK (
    conversation_id_hash IS NULL OR conversation_id_hash ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, thread_id)
);

CREATE INDEX idx_email_threads_tenant_root
  ON email_threads (tenant_id, root_message_id_hash, thread_id);

CREATE INDEX idx_email_threads_tenant_conversation
  ON email_threads (tenant_id, conversation_id_hash, thread_id)
  WHERE conversation_id_hash IS NOT NULL;

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_email_threads_tenant ON email_threads
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON email_threads TO vault_app;

ALTER TABLE email_messages
  ADD COLUMN thread_id uuid,
  ADD COLUMN conversation_id_hash char(64) CHECK (
    conversation_id_hash IS NULL OR conversation_id_hash ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE email_messages
  ADD CONSTRAINT fk_email_messages_thread
    FOREIGN KEY (tenant_id, thread_id)
    REFERENCES email_threads (tenant_id, thread_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_email_messages_tenant_thread
  ON email_messages (tenant_id, thread_id, sent_at DESC, email_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_email_messages_tenant_conversation
  ON email_messages (tenant_id, conversation_id_hash, email_id)
  WHERE conversation_id_hash IS NOT NULL;

COMMENT ON TABLE email_threads IS
  'Tenant-scoped email thread anchors. Store hashed Message-ID and Outlook conversation identifiers only; raw headers and message bodies are forbidden.';

COMMENT ON COLUMN email_messages.thread_id IS
  'Nullable C12 thread assignment. Existing import paths remain compatible until the thread assignment service is wired into email ingestion.';

COMMENT ON COLUMN email_messages.conversation_id_hash IS
  'SHA-256 hash of Outlook conversationId when available. Raw Outlook conversation identifiers must never be stored.';

-- Down Migration

DROP INDEX IF EXISTS idx_email_messages_tenant_conversation;
DROP INDEX IF EXISTS idx_email_messages_tenant_thread;

ALTER TABLE email_messages
  DROP CONSTRAINT IF EXISTS fk_email_messages_thread,
  DROP COLUMN IF EXISTS conversation_id_hash,
  DROP COLUMN IF EXISTS thread_id;

DROP TABLE IF EXISTS email_threads;
