-- Up Migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM litigation_facts
    WHERE status = 'verified'
      AND cardinality(citation_refs) = 0
  ) THEN
    RAISE EXCEPTION 'F5_BLOCKED_LITIGATION_FACTS_MISSING_CITATIONS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dd_issues
    WHERE status <> 'open'
      AND cardinality(citation_refs) = 0
  ) THEN
    RAISE EXCEPTION 'F5_BLOCKED_DD_ISSUES_MISSING_CITATIONS';
  END IF;
END $$;

ALTER TABLE litigation_facts
  ADD CONSTRAINT litigation_facts_verified_citation_refs_required_check
  CHECK (status <> 'verified' OR cardinality(citation_refs) >= 1);

ALTER TABLE dd_issues
  ADD CONSTRAINT dd_issues_non_open_citation_refs_required_check
  CHECK (status = 'open' OR cardinality(citation_refs) >= 1);

-- Down Migration
ALTER TABLE dd_issues
  DROP CONSTRAINT IF EXISTS dd_issues_non_open_citation_refs_required_check;

ALTER TABLE litigation_facts
  DROP CONSTRAINT IF EXISTS litigation_facts_verified_citation_refs_required_check;
