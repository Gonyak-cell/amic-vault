-- Up Migration

ALTER TABLE file_objects
  ADD COLUMN sha256 char(64);

COMMENT ON COLUMN file_objects.sha256 IS
  'Lowercase hex SHA-256 of uploaded bytes. Pre-R2-02 development/test rows may be backfilled with the all-zero placeholder because no content-derived hash existed before this migration.';

UPDATE file_objects
SET sha256 = repeat('0', 64)
WHERE sha256 IS NULL;

ALTER TABLE file_objects
  ALTER COLUMN sha256 SET NOT NULL,
  ADD CONSTRAINT file_objects_sha256_hex CHECK (sha256 ~ '^[0-9a-f]{64}$');

CREATE INDEX idx_file_objects_tenant_sha256 ON file_objects (tenant_id, sha256);

-- Down Migration

DROP INDEX IF EXISTS idx_file_objects_tenant_sha256;
ALTER TABLE file_objects
  DROP CONSTRAINT IF EXISTS file_objects_sha256_hex,
  DROP COLUMN IF EXISTS sha256;
