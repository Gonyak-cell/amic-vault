-- Up Migration

ALTER TABLE parties
  ADD COLUMN is_restricted boolean NOT NULL DEFAULT false;

CREATE INDEX idx_parties_restricted ON parties (tenant_id, matter_id, is_restricted)
  WHERE is_restricted = true;

-- Down Migration

DROP INDEX IF EXISTS idx_parties_restricted;

ALTER TABLE parties
  DROP COLUMN IF EXISTS is_restricted;
