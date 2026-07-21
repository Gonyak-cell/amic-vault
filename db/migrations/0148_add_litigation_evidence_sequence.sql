-- Up Migration

ALTER TABLE litigation_evidence_items
  ADD COLUMN evidence_direction text NOT NULL DEFAULT 'gap',
  ADD COLUMN evidence_sequence integer;

WITH numbered AS (
  SELECT
    evidence_id,
    row_number() OVER (
      PARTITION BY tenant_id, matter_id, evidence_direction
      ORDER BY created_at, evidence_code, evidence_id
    ) AS next_sequence
  FROM litigation_evidence_items
)
UPDATE litigation_evidence_items lei
SET evidence_sequence = numbered.next_sequence
FROM numbered
WHERE lei.evidence_id = numbered.evidence_id;

ALTER TABLE litigation_evidence_items
  ALTER COLUMN evidence_sequence SET NOT NULL,
  ADD CONSTRAINT litigation_evidence_direction_check CHECK (
    evidence_direction IN ('gap', 'eul')
  ),
  ADD CONSTRAINT litigation_evidence_sequence_check CHECK (
    evidence_sequence BETWEEN 1 AND 999999
  ),
  ADD CONSTRAINT litigation_evidence_direction_sequence_unique UNIQUE (
    tenant_id,
    matter_id,
    evidence_direction,
    evidence_sequence
  );

CREATE INDEX idx_litigation_evidence_tenant_matter_sequence
  ON litigation_evidence_items (
    tenant_id,
    matter_id,
    evidence_direction,
    evidence_sequence
  );

COMMENT ON COLUMN litigation_evidence_items.evidence_direction IS
  'Internal exhibit-side direction for Korean litigation labels: gap renders 갑, eul renders 을.';

COMMENT ON COLUMN litigation_evidence_items.evidence_sequence IS
  'Direction-scoped exhibit sequence used to render labels such as 갑 제3호증.';

-- Down Migration

DROP INDEX IF EXISTS idx_litigation_evidence_tenant_matter_sequence;

ALTER TABLE litigation_evidence_items
  DROP CONSTRAINT IF EXISTS litigation_evidence_direction_sequence_unique,
  DROP CONSTRAINT IF EXISTS litigation_evidence_sequence_check,
  DROP CONSTRAINT IF EXISTS litigation_evidence_direction_check,
  DROP COLUMN IF EXISTS evidence_sequence,
  DROP COLUMN IF EXISTS evidence_direction;
