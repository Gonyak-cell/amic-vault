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
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_rule_id_check;

ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_rule_id_check CHECK (rule_id IN (
    'kr-rrn-format-v1',
    'kr-alien-registration-format-v1',
    'bank-account-format-v1',
    'passport-format-v1',
    'payment-card-format-v1',
    'email-address-format-v1',
    'kr-phone-format-v1'
  ));

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_finding_type_check;

ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_finding_type_check CHECK (finding_type IN (
    'korean_resident_id',
    'korean_alien_registration_number',
    'bank_account',
    'passport_number',
    'payment_card_number',
    'email_address',
    'phone_number'
  ));

-- Down Migration

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

-- audit_events is append-only. After R5 DLP egress rows have been recorded,
-- rollback cannot safely remove DLP_EGRESS_BLOCKED from the allow-list.
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
      'DOCUMENT_TEXT_EXTRACTED',
      'SEARCH_REINDEX_REQUESTED',
      'SEARCH_EXECUTED',
      'DLP_SCAN_COMPLETED',
      'DLP_FINDING_RECORDED',
      'DLP_EGRESS_BLOCKED',
      'EMAIL_IMPORTED',
      'EMAIL_DUPLICATE_BLOCKED',
      'EMAIL_METADATA_UPDATED',
      'EMAIL_FILED'
    )
  );

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_rule_id_check;

-- DLP findings are append-only evidence. Keep the expanded R5 detector checks
-- on rollback so valid R5 rows are not stranded by a narrower constraint.
ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_rule_id_check CHECK (rule_id IN (
    'kr-rrn-format-v1',
    'kr-alien-registration-format-v1',
    'bank-account-format-v1',
    'passport-format-v1',
    'payment-card-format-v1',
    'email-address-format-v1',
    'kr-phone-format-v1'
  ));

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_finding_type_check;

ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_finding_type_check CHECK (finding_type IN (
    'korean_resident_id',
    'korean_alien_registration_number',
    'bank_account',
    'passport_number',
    'payment_card_number',
    'email_address',
    'phone_number'
  ));
