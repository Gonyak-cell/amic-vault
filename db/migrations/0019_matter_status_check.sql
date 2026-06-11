-- Up Migration

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS matters_status_check;

ALTER TABLE matters
  ADD CONSTRAINT matters_status_check CHECK (
    status IN (
      'proposed',
      'open',
      'active',
      'closing',
      'closed',
      'archived',
      'disposal_review',
      'disposed'
    )
  );

-- Down Migration

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS matters_status_check;

ALTER TABLE matters
  ADD CONSTRAINT matters_status_check CHECK (
    status IN (
      'proposed',
      'open',
      'active',
      'closing',
      'closed',
      'archived',
      'disposal_review',
      'disposed'
    )
  );
