-- Up Migration

ALTER TABLE email_messages
  ADD COLUMN parser_version text NOT NULL DEFAULT 'email-api-legacy-v1' CHECK (
    parser_version ~ '^email-[a-z0-9.-]{1,64}$'
  );

CREATE INDEX idx_email_messages_tenant_parser_version
  ON email_messages (tenant_id, parser_version, parse_status, created_at DESC, email_id);

COMMENT ON COLUMN email_messages.parser_version IS
  'Version of the email metadata parser that last produced the stored subject/date/participant metadata. Used for safe targeted reparse batches.';

-- Down Migration

DROP INDEX IF EXISTS idx_email_messages_tenant_parser_version;

ALTER TABLE email_messages
  DROP COLUMN IF EXISTS parser_version;
