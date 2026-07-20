-- Up Migration

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_source_type_check;

ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_source_type_check CHECK (
    source_type IN ('document', 'email', 'attachment', 'text', 'email_egress')
  );

COMMENT ON CONSTRAINT dlp_findings_source_type_check ON dlp_findings IS
  'C14 allows send-and-file egress scans to record hash-only DLP findings against the Outlook filing request id.';

-- Down Migration

DELETE FROM dlp_findings
WHERE source_type = 'email_egress';

ALTER TABLE dlp_findings
  DROP CONSTRAINT IF EXISTS dlp_findings_source_type_check;

ALTER TABLE dlp_findings
  ADD CONSTRAINT dlp_findings_source_type_check CHECK (
    source_type IN ('document', 'email', 'attachment', 'text')
  );
