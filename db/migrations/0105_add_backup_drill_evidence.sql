-- Up Migration

ALTER TABLE enterprise_backup_snapshots
  ADD COLUMN drill_id text CHECK (
    drill_id IS NULL OR drill_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'
  ),
  ADD COLUMN drill_evidence_ref text CHECK (
    drill_evidence_ref IS NULL OR drill_evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'
  ),
  ADD COLUMN drill_manifest_hash char(64) CHECK (
    drill_manifest_hash IS NULL OR drill_manifest_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN schema_hash char(64) CHECK (
    schema_hash IS NULL OR schema_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN restored_schema_hash char(64) CHECK (
    restored_schema_hash IS NULL OR restored_schema_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN row_counts_drift_hash char(64) CHECK (
    row_counts_drift_hash IS NULL OR row_counts_drift_hash ~ '^[0-9a-f]{64}$'
  );

COMMENT ON COLUMN enterprise_backup_snapshots.drill_id IS
  'Bounded monthly restore drill reference; no provider identifiers or endpoints.';
COMMENT ON COLUMN enterprise_backup_snapshots.drill_manifest_hash IS
  'SHA-256 hash of the restore drill manifest recorded by tools/release/backup-restore-drill.mjs.';

-- Down Migration

ALTER TABLE enterprise_backup_snapshots
  DROP COLUMN IF EXISTS row_counts_drift_hash,
  DROP COLUMN IF EXISTS restored_schema_hash,
  DROP COLUMN IF EXISTS schema_hash,
  DROP COLUMN IF EXISTS drill_manifest_hash,
  DROP COLUMN IF EXISTS drill_evidence_ref,
  DROP COLUMN IF EXISTS drill_id;
