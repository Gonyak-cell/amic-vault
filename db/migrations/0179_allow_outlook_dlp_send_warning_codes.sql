-- Up Migration

ALTER TABLE outlook_filing_requests
  DROP CONSTRAINT IF EXISTS outlook_filing_requests_send_warning_codes_check;

ALTER TABLE outlook_filing_requests
  ADD CONSTRAINT outlook_filing_requests_send_warning_codes_check CHECK (
    send_warning_codes <@ ARRAY[
      'no_matter',
      'wrong_matter',
      'external_recipient',
      'dlp_finding',
      'dlp_scan_failed'
    ]::text[]
    AND cardinality(send_warning_codes) <= 8
  );

COMMENT ON CONSTRAINT outlook_filing_requests_send_warning_codes_check ON outlook_filing_requests IS
  'C14 permits hash-only Smart Alert DLP warning codes; raw recipient, subject, body, domain, filename, or finding values remain forbidden.';

-- Down Migration

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM outlook_filing_requests
    WHERE send_warning_codes && ARRAY['dlp_finding', 'dlp_scan_failed']::text[]
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove C14 Outlook DLP warning codes while append-only filing requests reference them';
  END IF;
END $$;

ALTER TABLE outlook_filing_requests
  DROP CONSTRAINT IF EXISTS outlook_filing_requests_send_warning_codes_check;

ALTER TABLE outlook_filing_requests
  ADD CONSTRAINT outlook_filing_requests_send_warning_codes_check CHECK (
    send_warning_codes <@ ARRAY[
      'no_matter',
      'wrong_matter',
      'external_recipient'
    ]::text[]
    AND cardinality(send_warning_codes) <= 8
  );
