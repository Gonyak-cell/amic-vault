-- Up Migration

CREATE TABLE bad_rows (
  bad_row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL
);

-- Down Migration

DROP TABLE IF EXISTS bad_rows;
