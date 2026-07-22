-- Up Migration
-- Infection is terminal and never promotes. The scanner intentionally omits
-- engine/signature details for this verdict so Vault cannot retain detection
-- metadata; the verified object hash and bounded result code remain required.

ALTER TABLE file_security_scans DROP CONSTRAINT file_security_scans_check;
ALTER TABLE file_security_scans ADD CONSTRAINT file_security_scans_check CHECK (
  (state = 'quarantined'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND promoted_at IS NULL)
  OR (state = 'scanning'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND promoted_at IS NULL)
  OR (state = 'clean'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NULL)
  OR (state = 'infected'
    AND result_code = 'infected'
    AND observed_sha256 IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NULL)
  OR (state = 'error'
    AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
    AND promoted_at IS NULL)
  OR (state = 'security_hold'
    AND result_code IN ('stale_signature', 'hash_mismatch', 'manual_hold')
    AND promoted_at IS NULL)
  OR (state = 'promoted'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NOT NULL)
);

ALTER TABLE file_security_scan_attempts DROP CONSTRAINT file_security_scan_attempts_check;
ALTER TABLE file_security_scan_attempts ADD CONSTRAINT file_security_scan_attempts_check CHECK (
  (state = 'scanning'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND finished_at IS NULL)
  OR (state = 'clean'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND finished_at IS NOT NULL)
  OR (state = 'infected'
    AND result_code = 'infected'
    AND observed_sha256 IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND finished_at IS NOT NULL)
  OR (state = 'error'
    AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
    AND finished_at IS NOT NULL)
  OR (state = 'security_hold'
    AND result_code IN ('stale_signature', 'hash_mismatch')
    AND finished_at IS NOT NULL)
);

-- Down Migration
-- A historical minimal infected verdict cannot be represented by the prior
-- schema, so refuse a lossy rollback rather than fabricating scanner metadata.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM file_security_scans
    WHERE state = 'infected' AND (engine_version IS NULL OR signature_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM file_security_scan_attempts
    WHERE state = 'infected' AND (engine_version IS NULL OR signature_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0206 while minimal infected verdicts exist';
  END IF;
END $$;

ALTER TABLE file_security_scans DROP CONSTRAINT file_security_scans_check;
ALTER TABLE file_security_scans ADD CONSTRAINT file_security_scans_check CHECK (
  (state = 'quarantined'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND promoted_at IS NULL)
  OR (state = 'scanning'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND promoted_at IS NULL)
  OR (state = 'clean'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NULL)
  OR (state = 'infected'
    AND result_code = 'infected'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NULL)
  OR (state = 'error'
    AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
    AND promoted_at IS NULL)
  OR (state = 'security_hold'
    AND result_code IN ('stale_signature', 'hash_mismatch', 'manual_hold')
    AND promoted_at IS NULL)
  OR (state = 'promoted'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND promoted_at IS NOT NULL)
);

ALTER TABLE file_security_scan_attempts DROP CONSTRAINT file_security_scan_attempts_check;
ALTER TABLE file_security_scan_attempts ADD CONSTRAINT file_security_scan_attempts_check CHECK (
  (state = 'scanning'
    AND result_code = 'pending'
    AND engine_version IS NULL
    AND signature_at IS NULL
    AND observed_sha256 IS NULL
    AND finished_at IS NULL)
  OR (state = 'clean'
    AND result_code = 'clean'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND finished_at IS NOT NULL)
  OR (state = 'infected'
    AND result_code = 'infected'
    AND engine_version IS NOT NULL
    AND signature_at IS NOT NULL
    AND observed_sha256 = expected_sha256
    AND finished_at IS NOT NULL)
  OR (state = 'error'
    AND result_code IN ('scanner_error', 'scanner_timeout', 'malformed_response')
    AND finished_at IS NOT NULL)
  OR (state = 'security_hold'
    AND result_code IN ('stale_signature', 'hash_mismatch')
    AND finished_at IS NOT NULL)
);
