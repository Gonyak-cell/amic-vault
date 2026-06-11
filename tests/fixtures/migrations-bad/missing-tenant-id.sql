-- Up Migration

CREATE TABLE bad_records (
  bad_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL
);

ALTER TABLE bad_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bad_records FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_bad_records_tenant ON bad_records USING (true);

-- Down Migration

DROP TABLE IF EXISTS bad_records;
