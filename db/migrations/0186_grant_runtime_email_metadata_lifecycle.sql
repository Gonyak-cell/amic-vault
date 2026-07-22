-- Up Migration

-- Existing audited email metadata reparse and thread assignment update only
-- these persisted metadata columns. RLS remains the row-isolation authority.
GRANT UPDATE (
  parser, parser_version, parse_status, failure_reason_code, subject,
  sent_at, received_at, metadata_warning_code, references_json,
  has_outside_participants, thread_id, conversation_id_hash
) ON email_messages TO vault_app;

-- Existing filing-time participant classification updates only these flags.
GRANT UPDATE (participant_class, is_outside) ON email_participants TO vault_app;

-- Down Migration

REVOKE UPDATE (
  parser, parser_version, parse_status, failure_reason_code, subject,
  sent_at, received_at, metadata_warning_code, references_json,
  has_outside_participants, thread_id, conversation_id_hash
) ON email_messages FROM vault_app;

REVOKE UPDATE (participant_class, is_outside) ON email_participants FROM vault_app;
