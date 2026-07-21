-- Up Migration

-- Existing email ingestion, thread assignment, matter filing, and reparse
-- paths update only bounded envelope metadata. Preserve RLS and raw-email
-- immutability; no body or raw-header storage privilege is introduced.
GRANT UPDATE (
  parser, parser_version, parse_status, failure_reason_code,
  subject, sent_at, received_at, metadata_warning_code, references_json,
  has_outside_participants, thread_id, conversation_id_hash
) ON email_messages TO vault_app;

GRANT UPDATE (participant_class, is_outside) ON email_participants TO vault_app;
GRANT DELETE ON email_participants TO vault_app;

-- Down Migration

REVOKE UPDATE (
  parser, parser_version, parse_status, failure_reason_code,
  subject, sent_at, received_at, metadata_warning_code, references_json,
  has_outside_participants, thread_id, conversation_id_hash
) ON email_messages FROM vault_app;

REVOKE UPDATE (participant_class, is_outside) ON email_participants FROM vault_app;
REVOKE DELETE ON email_participants FROM vault_app;
